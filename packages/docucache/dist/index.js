// src/index.ts
import EventEmitter from "eventemitter3";
import {MemoryStore} from "./stores/mem";
var defaultCacheIdGetter = function(document, type, idFields) {
  const id = idFields.map((field) => document[field] ?? "").join("+");
  if (!type && !id) {
    return null;
  }
  if (/^.+:.+/.test(id)) {
    return id;
  }
  return [type, id].join(":");
};
var defaultCacheTypeGetter = function(document, typeFields, idFields) {
  const id = idFields.map((field) => document[field] ?? "").join("+");
  return typeFields.map((field) => document[field]).find(Boolean) ?? id?.match(/^([^:]+):/)?.[1];
};
var NotCachedSymbol = Symbol("NotCached");
var Missing = Symbol("MissingDocument");

class DocEventEmitter extends EventEmitter {
  constructor() {
    super(...arguments);
  }
  bindTo(topics, ctx) {
    const fns = ["on", "once", "off", "emit", "listeners", "listenerCount", "removeListener", "removeAllListeners", "addListener"];
    const prefix = topics.join("--@--");
    const self = this;
    return fns.reduce((acc, fn) => {
      acc[fn] = function(e, ...args) {
        let result = self[fn](prefix + "--:--" + e, ...args);
        return result === self ? acc : result;
      };
      return acc;
    }, {});
  }
  emitTo(topics, event, ...args) {
    const performed = new Set;
    this.eventNames().map((event2) => [event2, ...event2.split("--:--")]).filter(([, , topicEvent]) => event === topicEvent).filter(([, topicKey]) => {
      const subscribedTopics = topicKey.split("--@--");
      return subscribedTopics.some((topic) => topics.includes(topic));
    }).forEach(([eventName]) => {
      if (performed.has(eventName)) {
        return;
      }
      performed.add(eventName);
      this.emit(eventName, ...args);
    });
  }
}

class Docucache {
  store = new MemoryStore;
  pendingUpdateTimeout;
  pendingUpdates = {
    create: new Set,
    update: new Set,
    delete: new Set
  };
  emitter = new DocEventEmitter;
  policies = {};
  getDocumentType;
  stats = new Map;
  idFields;
  typeFields;
  autoRemoveOprhans;
  constructor({
    getDocumentType = defaultCacheTypeGetter,
    policies = {},
    typeFields = ["__typename", "_type"],
    idFields = ["_id"],
    autoRemoveOrphans = false
  } = {}) {
    this.getDocumentType = getDocumentType;
    this.policies = policies;
    this.idFields = idFields;
    this.typeFields = typeFields;
    this.autoRemoveOprhans = autoRemoveOrphans;
  }
  notifyChanges(event, ref) {
    this.pendingUpdates[event].add(ref);
    if (this.pendingUpdateTimeout) {
      return;
    }
    this.pendingUpdateTimeout = setTimeout(() => {
      this.flushPendingUpdates();
    }, 0);
  }
  flushPendingUpdates() {
    clearTimeout(this.pendingUpdateTimeout);
    this.pendingUpdateTimeout = null;
    const order = ["create", "update", "delete"];
    for (const event of order) {
      const refs = this.pendingUpdates[event];
      for (const ref of refs) {
        this.emitter.emitTo([ref], event, ref);
      }
      refs.clear();
    }
    this.emitter.emit("flushed");
  }
  flushed() {
    return new Promise((resolve) => {
      this.emitter.once("flushed", resolve);
    });
  }
  size() {
    return this.store.size();
  }
  isDocument(obj) {
    if (!obj || Array.isArray(obj) || typeof obj !== "object") {
      return false;
    }
    return !!this.getDocumentType(obj, this.typeFields, this.idFields);
  }
  getCacheId(document) {
    const type = this.getDocumentType(document, this.typeFields, this.idFields);
    const policy = this.policies[type];
    return policy?.getCacheId?.(document, type, policy.idFields ?? this.idFields) ?? defaultCacheIdGetter(document, type, this.idFields);
  }
  getShape(obj) {
    if (typeof obj !== "object") {
      return typeof obj;
    }
    const isArray = Array.isArray(obj);
    if (isArray) {
      const document = obj.find((d) => this.isDocumentOrRef(d));
      const isHomogenous = document && obj.every((d) => this.isDocumentOrRef(d));
      if (isHomogenous) {
        return [this.resolveType(document)];
      }
    }
    const result = Object.entries(obj).reduce((shape, [key, value]) => {
      const isMetaKey = this.typeFields.includes(key) || this.idFields.includes(key);
      if (isMetaKey) {
        return shape;
      }
      shape[key] = this.isDocumentOrRef(value) ? this.resolveType(value) : this.getShape(value);
      return shape;
    }, isArray ? [] : {});
    if (isArray) {
      const isHomogenous = Object.values(result).every((value) => value === result[0]);
      return isHomogenous ? `${result[0]}[]` : result;
    }
    return result;
  }
  isDocumentOrRef(doc) {
    if (typeof doc === "string") {
      const regex = /^(__ref:)?[^:]+:/;
      return regex.test(doc);
    }
    return !!this.getDocumentType(doc, this.typeFields, this.idFields);
  }
  resolveType(obj) {
    if (typeof obj === "string") {
      const regex = /^(__ref:)?([^:]+):/;
      const match = obj.match(regex);
      return match?.[2] ?? null;
    }
    return this.getDocumentType(obj, this.typeFields, this.idFields);
  }
  resolveId(obj) {
    if (typeof obj === "string") {
      if (obj.startsWith("__ref:")) {
        return obj.slice("__ref:".length);
      }
      return obj;
    }
    return this.getCacheId(obj);
  }
  resolveRef(ref, opts = {}) {
    if (!ref.startsWith("__ref:")) {
      return null;
    }
    const id = ref.slice("__ref:".length);
    return this.resolve(id, opts);
  }
  async resolve(id, opts = {}) {
    if (!await this.store.has(id)) {
      return null;
    }
    return this.denormalize(await this.store.get(id));
  }
  async update(document, updater) {
    const id = this.resolveId(document);
    const current = await this.denormalize(await this.resolve(id));
    const updated = updater(current) ?? current;
    await this.addAll(this.extract(updated));
  }
  async add(document) {
    const id = this.getCacheId(document);
    const normalized = this.normalize(document);
    const current = await this.store.get(id);
    const newValue = Object.assign(current ?? {}, normalized);
    await this.store.set(id, newValue);
    this.notifyChanges(current ? "update" : "create", id);
  }
  async addAll(documents) {
    for (const document of documents) {
      await this.add(document);
    }
  }
  extract(obj) {
    if (obj && typeof obj === "object") {
      const subDocuments = Object.values(obj).flatMap((val) => this.extract(val));
      if (this.isDocument(obj)) {
        return [obj, ...subDocuments];
      }
      return subDocuments;
    }
    return [];
  }
  extractRefs(obj) {
    if (!obj) {
      return [];
    }
    if (typeof obj === "string" && obj.startsWith("__ref:")) {
      return [obj];
    }
    return [...new Set(this.extract(obj).map(this.getCacheId.bind(this)))].sort((a, b) => a.localeCompare(b));
  }
  extractAndAdd(obj) {
    return this.addAll(this.extract(obj));
  }
  extractAndAddOptimistic(obj) {
    const documents = this.extract(obj);
  }
  async addAsDocument(obj, key) {
    await this.extractAndAdd(obj);
    await this.store.set(key, this.normalize(obj));
  }
  async fromResult(fn, key) {
    const result = fn();
    if (result instanceof Promise) {
      const data = await result;
      await this.addAsDocument(data, key);
    } else {
      await this.addAsDocument(result, key);
    }
    return result;
  }
  async remove(obj) {
    const id = this.resolveId(obj);
    await this.store.delete(id);
    this.notifyChanges("delete", id);
  }
  removeIfOprhaned(id) {
  }
  clear() {
    return this.store.clear();
  }
  normalize(obj) {
    if (typeof obj !== "object" || !obj) {
      return obj;
    }
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (this.isDocument(value)) {
        const id = this.getCacheId(value);
        acc[key] = `__ref:${id}`;
      } else {
        acc[key] = this.normalize(value);
      }
      return acc;
    }, Array.isArray(obj) ? [] : {});
  }
  async denormalize(obj) {
    if (typeof obj === "string" && obj.startsWith("__ref:")) {
      return this.resolveRef(obj);
    }
    if (typeof obj === "object") {
      let result = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        result[key] = await this.denormalize(obj[key]);
      }
      return result;
    }
    return obj;
  }
  export() {
    return this.store.export();
  }
  async import(items) {
    for (const { id, document } of items) {
      await this.store.set(id, document);
    }
  }
  wrap(fn, options = {}) {
    let result = fn();
    if (result instanceof Promise) {
      result = result.then((data) => {
        this.extractAndAdd(data);
        return data;
      }).catch((err) => {
        if (typeof options.rollback === "function") {
          this.extractAndAdd(options.rollback());
        } else if (options.rollback !== false) {
        }
        throw err;
      });
    }
    if (options.optimistic) {
      let optimisticResult = options.optimistic;
      if (typeof optimisticResult === "function") {
        optimisticResult = optimisticResult();
      }
      this.extractAndAddOptimistic(optimisticResult);
    }
    return result;
  }
  subscription(doc) {
    const refs = typeof doc === "string" ? [doc] : this.extractRefs(doc);
    if (!refs?.length) {
      throw new Error("Cannot subscribe to an object with no refs");
    }
    return this.emitter.bindTo(refs, doc);
  }
}
export {
  Missing,
  Docucache
};
