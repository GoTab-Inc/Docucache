import EventEmitter from 'eventemitter3';
import type { Store } from './stores';
import { MemoryStore } from './stores/mem';

export type Document<T extends object = {}> = T;

export type CachePolicy = {
  /**
   * A function used to determine the cache id of a document.
   * The default is to use getType and getId to construct a string in the format "type:id".
   * If a null is returned, the document will not match this policy
   */
  getCacheId?: (document: Document, type: string, idFields: string[]) => string | null;
  /**
   * A function used to extract the type from a document. The default is to search for a type field in the document.
   */
  getType?: (document: Document, typeFields: string[]) => string;
  /**
   * A function used to determine the id of a document. The default is to search for an id field in the document.
   */
  getId?: (document: Document, idFields: string[]) => string;
  /**
   * The fields to use to determine the id of the document. The fields will be checked in order for a string value and the first one found will be used as the document's id.
   */
  idFields?: string[];
  /**
   * The fields used to determine the type of the document. The fields will be checked in order for a string value and the first one found will be used as the document's type.
   */
  typeFields?: string[];
  /**
   * If true, an error will be thrown if the document is not found in the cache.
   * If false, the document will be returned as Missing. Default is `false` when getDocuments is not set. Otherwise `true`.
   */
  throwOnMissing?: boolean;
  /**
   * When one or more documents are missing, this function will be called to fetch them
   * The global getDocuments function will be called before any policy-specific getDocuments function.
   * The documents that the global getDocuments function can't find will be passed to the policy-specific getDocuments function.
   * If this is set, throwOnMissing will default to true.
   */
  onMissingDocuments?: (ids: string[]) => Promise<Document[]>;

  /**
   * When a document is updated this function is called and if it returns `true` the document will be removed from the cache.
   * This can be useful to remove documents with an `archive` field set to `true` for example.
   */
  shouldDelete?: (document: Document) => boolean;
};

type CachePolicies = Record<string, CachePolicy>;

export type DocucacheInitOptions = {
  getDocumentType?: (document: Document) => string;
  idFields?: string[];
  typeFields?: string[];
  policies?: CachePolicies;
  autoRemoveOrphans?: boolean;
}

type DocucacheWrapOptions = {
  // An object or function returning an object that will be merged into the document cache.
  optimistic?: (() => any) | object;
  // A function that is called when the update fails. Generally used to rollback optimistic changes.
  rollback?: boolean | (() => void);
}

type StoreResolveOpts = {
  throwIfMissing?: boolean;
  onMissingValue?: (id: string) => Promise<any>;
}

const NotCachedSymbol = Symbol('NotCached');
export const Missing = Symbol('MissingDocument');

function defaultCacheIdGetter(document: Record<string, string>, type: string, idFields: string[]): string {
  const id = idFields.map(field => document[field] ?? '').join('+');

  if(!type && !id) {
    return null;
  }
  // eg: "User:123"
  if(/^.+:.+/.test(id)) {
    return id;
  }
  // eg: {type: "User", id: "123"} or {__typename: "User", _id: "123"}
  return [type, id].join(':');
}

// TODO: this should take in the policies and use the policy's getType function?
function defaultCacheTypeGetter(document: Record<string, string>, typeFields: string[], idFields: string[]): string {
  const id = idFields.map(field => document[field] ?? '').join('+');
  return typeFields.map(field => document[field]).find(Boolean) ?? id?.match(/^([^:]+):/)?.[1];
}

function toType(obj: any) {
  if(typeof obj === 'string') {
    return obj;
  }
  // TODO: Construct a util.inspect-like string representation of the object type
  return Object.prototype.toString.call(obj).slice(8, -1);
}

// This is a topical event emitter that is used to optimize how updates are emitted
class DocEventEmitter extends EventEmitter {
  /**
   * Returns an object that implements an EventEmitter for the given "topics"
   * Calling any of the methods on the returned object will assume the event only applies to the given topics
   * When emitTo is called from the main emitter, all listeners that have an event subscribed to at least one topic will be called
   */
  bindTo<T = any>(topics: string[], ctx): EventEmitter<'create' | 'update' | 'delete', T> {
    const fns = ['on', 'once', 'off', 'emit', 'listeners', 'listenerCount', 'removeListener', 'removeAllListeners', 'addListener'];
    const prefix = topics.join('--@--');
    const self = this;
    return fns.reduce((acc, fn) => {
      acc[fn] = function (e: string, ...args: any[]) {
        let result = self[fn](prefix + '--:--' + e, ...args);
        return result === self ? acc : result;
      }
      return acc;
    }, {}) as any;
  }

  /**
   * Emits an event to all listeners that have subscribed to at least one of the topics in the given list
   */
  emitTo(topics: string[], event: string, ...args: any[]) {
    const performed = new Set<string>();
    this.eventNames()
      .map((event: string) => [event, ...event.split('--:--')])
      // Filter out event names that don't include the event type
      .filter(([,, topicEvent]) => event === topicEvent)
      // Filter out event names that don't include any of the topics
      .filter(([, topicKey]) => {
        const subscribedTopics = topicKey.split('--@--');
        return subscribedTopics.some(topic => topics.includes(topic));
      })
      .forEach(([eventName]) => {
        if(performed.has(eventName)) {
          return;
        }
        performed.add(eventName);
        this.emit(eventName, ...args);
      });
  }
}

export class Docucache {

  private store: Store = new MemoryStore();

  private pendingUpdateTimeout: number;

  private pendingUpdates = {
    create: new Set<string>(),
    update: new Set<string>(),
    delete: new Set<string>(),
  };

  /**
   * A singleton emitter for all the cache events
   */
  private emitter = new DocEventEmitter();

  private policies: CachePolicies = {};

  private getDocumentType: (document: any, typeFields: string[], idFields: string[]) => string;

  // Holds statistics by type such as size, refs, 
  private stats = new Map<string, any>();

  private idFields: string[];

  private typeFields: string[];

  private autoRemoveOprhans: boolean;
  
  constructor({
    getDocumentType = defaultCacheTypeGetter,
    policies = {},
    typeFields = ['__typename', '_type'],
    idFields = ['_id'],
    autoRemoveOrphans = false,
  } = {} as DocucacheInitOptions) {
    this.getDocumentType = getDocumentType;
    this.policies = policies;
    this.idFields = idFields;
    this.typeFields = typeFields;
    this.autoRemoveOprhans = autoRemoveOrphans;
  }

  private notifyChanges(event: 'create' | 'update' | 'delete', ref: string) {
    this.pendingUpdates[event].add(ref);
    if(this.pendingUpdateTimeout) {
      return;
    }
    // Flush the updates on the next tick. This is so that we can batch updates
    this.pendingUpdateTimeout = setTimeout(() => {
      this.flushPendingUpdates();
    }, 0);
  }

  flushPendingUpdates() {
    clearTimeout(this.pendingUpdateTimeout);
    this.pendingUpdateTimeout = null;
    const order = ['create', 'update', 'delete'];
    for(const event of order) {
      const refs = this.pendingUpdates[event as keyof typeof this.pendingUpdates];
      for(const ref of refs) {
        this.emitter.emitTo([ref], event, ref);
      }
      refs.clear();
    }
    this.emitter.emit('flushed');
  }

  flushed() {
    return new Promise<void>((resolve) => {
      this.emitter.once('flushed', resolve);
    });
  }

  /**
   * The size of the cache
   */
  size() {
    return this.store.size();
  }

  /**
   * Determines if an object is a document
   */
  private isDocument(obj: any): boolean {
    // Has to be a non-null plain object
    if(!obj || Array.isArray(obj) || typeof obj !== 'object') {
      return false;
    }
    return !!this.getDocumentType(obj, this.typeFields, this.idFields);
  }

  /**
   * Given a document or object, try to determine the cacheId
   */
  private getCacheId(document: Document) {
    const type = this.getDocumentType(document, this.typeFields, this.idFields);
    const policy = this.policies[type];
    return policy?.getCacheId?.(document, type, policy.idFields ?? this.idFields) 
      ?? defaultCacheIdGetter(document, type, this.idFields);
  }

  private getShape(obj: any) {
    if(typeof obj !== 'object') {
      return typeof obj;
    }
    const isArray = Array.isArray(obj);
    if(isArray) {
      const document = obj.find(d => this.isDocumentOrRef(d));
      const isHomogenous = document && obj.every(d => this.isDocumentOrRef(d));
      if(isHomogenous) {
        return [this.resolveType(document)]
      }
    }
    const result = Object.entries(obj).reduce((shape, [key, value]) => {
      const isMetaKey = this.typeFields.includes(key) || this.idFields.includes(key)
      if(isMetaKey) {
        return shape;
      }
      shape[key] = this.isDocumentOrRef(value) 
        ? this.resolveType(value)
        : this.getShape(value);
      return shape;
    }, isArray ? [] : {});
    if(isArray) {
      const isHomogenous = Object.values(result).every(value => value === result[0]);
      return isHomogenous 
        ? `${result[0]}[]`
        : result;
    }
    return result;
  }

  private isDocumentOrRef(doc: Document | string) {
    if(typeof doc === 'string') {
      const regex = /^(__ref:)?[^:]+:/;
      return regex.test(doc);
    }
    return !!this.getDocumentType(doc, this.typeFields, this.idFields);
  }

  private resolveType(obj: Document | string) {
    if(typeof obj === 'string') {
      const regex = /^(__ref:)?([^:]+):/;
      const match = obj.match(regex);
      return match?.[2] ?? null;
    }
    return this.getDocumentType(obj, this.typeFields, this.idFields);
  }

  /**
   * Resolve a string, ref, or document to an id
   */
  resolveId(obj: string | Document) {
    if(typeof obj === 'string') {
      if(obj.startsWith('__ref:')) {
        return obj.slice('__ref:'.length);
      }
      return obj;
    }
    return this.getCacheId(obj);
  }

  /**
   * Resolve a reference to a document
   */
  resolveRef<T extends object>(ref: string, opts: StoreResolveOpts = {}) {
    if(!ref.startsWith('__ref:')) {
      return null;
    }
    const id = ref.slice('__ref:'.length);
    return this.resolve<T>(id, opts);
  }
  
  /**
   * Resolves a document from the cache using the store.
   * The document will be denormalized and references will be resolved as well.
   */
  async resolve<T extends object>(id: string, opts: StoreResolveOpts = {}): Promise<T> {
    if(!(await this.store.has(id))) {
      return null;
    }

    return this.denormalize(await this.store.get(id)) as T;
  }

  /**
   * Updates a document in the cache. The updater will receive a denormalized version of the document.
   */
  async update<T extends object>(
    document: Document<T> | string, 
    updater: (document: Document<T>) => Document | Document[] | void,
  ) {
    const id = this.resolveId(document);
    const current = await this.denormalize<Document<T>>(await this.resolve(id));
    const updated = updater(current) ?? current;
    await this.addAll(this.extract(updated));
  }

  /**
   * Add a document to the cache. Document references will be normalized but not automatically added to the cache.
   */
  async add<T extends object>(document: Document<T>) {
    const id = this.getCacheId(document);
    const normalized = this.normalize(document);
    const current = await this.store.get(id);
    // Note: this is where cache object merging happens. It might be better to complicate this logic
    // so that it can be custom. For example, replace instead of merging
    const newValue = Object.assign(current ?? {}, normalized);
    await this.store.set(id, newValue);
    this.notifyChanges(current ? 'update' : 'create', id);
  }

  /**
   * Add multiple documents to the cache
   */
  async addAll(documents: Document[]) {
    // Should this serial or parallel?
    // With parallel we might run into memory issues
    for(const document of documents) {
      await this.add(document);
    }
  }

  /**
   * Extract the documents from any object, no matter how deeply nested
   */
  extract(obj: any) {
    if(obj && typeof obj === 'object') {
      // This handles both arrays and objects
      const subDocuments = Object.values(obj).flatMap((val) => this.extract(val));
      if(this.isDocument(obj)) {
        return [obj, ...subDocuments];
      }
      return subDocuments;
    }
    return [];
  }

  extractRefs(obj: any): string[] {
    if(!obj) {
      return [];
    }
    if(typeof obj === 'string' && obj.startsWith('__ref:')) {
      return [obj];
    }
    // TODO: this doesn't exactly return a ref, it returns a cacheId. Should it be a ref?
    return [...new Set<any>(this.extract(obj)
      .map(this.getCacheId.bind(this)))]
      .sort((a: string, b: string) => a.localeCompare(b));
  }

  /**
   * Extracts the documents from the given object, no matter how deeply nested, and adds them to the cache.
   */
  extractAndAdd(obj: any) {
    return this.addAll(this.extract(obj));
  }

  private extractAndAddOptimistic(obj: any) {
    const documents = this.extract(obj);
  }

  /**
   * Add an object to the cache and treat it as a document. Useful for caching the result of an HTTP request.
   * Note that this will not merge the object with the existing document and will overwrite it instead.
   */
  async addAsDocument(obj: any, key: string) {
    await this.extractAndAdd(obj);
    await this.store.set(key, this.normalize(obj));
  }

  /**
   * Runs a function and caches the result as a document.
   */
  async fromResult<T>(fn: () => T, key: string) {
    const result = fn();
    if(result instanceof Promise) {
      const data = await result;
      await this.addAsDocument(data, key);
    } else {
      await this.addAsDocument(result, key);
    }
    return result;
  }

  /**
   * Remove a document from the cache.
   */
  async remove(obj: Document | string) {
    const id = this.resolveId(obj);
    await this.store.delete(id);
    this.notifyChanges('delete', id);
  }

  /**
   * Remove a 
   * @param id 
   */
  private removeIfOprhaned(id: string) {

  }

  /**
   * Clear this cache and reset it to an empty state.
   */
  clear() {
    return this.store.clear();
  }

  /**
   * Returns a normalized version of an object, replacing any documents with references.
   * Unlike in GraphQL documents can be arbitrarily nested within other documents so this recursively normalizes the entire object.
   */
  normalize(obj: object) {
    if(typeof obj !== 'object' || !obj) {
      return obj;
    }
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if(this.isDocument(value)) {
        const id = this.getCacheId(value);
        acc[key] = `__ref:${id}`;
      } else {
        acc[key] = this.normalize(value);
      }
      return acc;
    }, Array.isArray(obj) ? [] : {});
  }

  /**
   * Returns a denormalized version of any object, resolving all references.
   */
  async denormalize<T extends any>(obj: any): Promise<T> {
    // Iterate through the object and whenever a reference is encountered, replace it with a document
    if(typeof obj === 'string' && obj.startsWith('__ref:')) {
      return this.resolveRef(obj) as T;
    }
    if(typeof obj === 'object') {
      let result = Array.isArray(obj) ? [] : {};
      for(const key in obj) {
        // Mega slight optimization would be to skip non-string primitives here
        result[key] = await this.denormalize(obj[key]);
      }
      return result as T;
    }
    return obj as T;
  }

  /**
   * Returns a JSON-serializable representation of the cache.
   */
  export() {
    return this.store.export();
  }

  /**
   * Import the cache/subset of cache previously exported with `export()`.
   * This will overwrite existing documents should they have the same id.
   */
  async import(items: Awaited<ReturnType<this['export']>>) {
    for(const {id, document} of items) {
      await this.store.set(id, document);
    }
  }

  /**
   * Run a function and cache the result of any documents returned.
   * Other settings can be passed to control the behavior of the cache such as optimstic updates.
   */
  wrap<T>(fn: () => Promise<T>, options: DocucacheWrapOptions = {}) {
    let result = fn();
    if(result instanceof Promise) {
      result = result.then(data => {
        this.extractAndAdd(data);
        return data;
      }).catch(err => {
        // TODO: remove optimistic updates
        if(typeof options.rollback === 'function') {
          this.extractAndAdd(options.rollback());
        } else if(options.rollback !== false) {
          // rollback previous updates
        }
        throw err;
      });
    }
    if(options.optimistic) {
      let optimisticResult = options.optimistic;
      if(typeof optimisticResult === 'function') {
        optimisticResult = optimisticResult();
      }
      this.extractAndAddOptimistic(optimisticResult);
    }
    return result;
  }

  subscription<T = any>(doc: any) {
    const refs = typeof doc === 'string' ? [doc] : this.extractRefs(doc);
    if(!refs?.length) {
      throw new Error('Cannot subscribe to an object with no refs');
    }
    return this.emitter.bindTo<T>(refs, doc);
  }
}
