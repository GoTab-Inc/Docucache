// src/index.ts
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

class Docucache {
  store = new MemoryStore;
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
      const regex = /^(__ref:)?([^:]+):/;
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
    const type = this.getDocumentType(document, this.typeFields, this.idFields);
    const normalized = this.normalize(document);
    const current = await this.store.get(id);
    const newValue = Object.assign(current ?? {}, normalized);
    await this.store.set(id, newValue);
    const stats = this.stats.get(type) ?? {
      size: 0,
      refs: new Set,
      shape: this.getShape(normalized)
    };
    stats.size += 1;
    stats.refs.add(id);
    this.stats.set(type, stats);
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
  remove(obj) {
    const id = this.resolveId(obj);
    return this.store.delete(id);
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
    if (typeof obj !== "object" || !obj) {
      return obj;
    }
    const result = await Object.entries(obj).reduce(async (aacc, [key, value]) => {
      const acc = await aacc;
      if (typeof value === "string" && value.startsWith("__ref:")) {
        const id = value.slice("__ref:".length);
        acc[key] = await this.resolve(id) ?? NotCachedSymbol;
      } else {
        acc[key] = await this.denormalize(value);
      }
      return acc;
    }, Array.isArray(obj) ? Promise.resolve([]) : Promise.resolve({}));
    if (Array.isArray(result)) {
      return result.filter((item) => item !== NotCachedSymbol);
    }
    if (typeof result === "object") {
      for (const key in result) {
        if (result[key] === NotCachedSymbol) {
          result[key] = null;
        }
      }
    }
    return result;
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
}
export {
  Docucache
};
