export type Document<T extends object = {}> = T;

export type CachePolicy = {
  getCacheId?: (document: Document, type: string, idFields: string[]) => string;
  idFields?: string[];
};

type CachePolicies = Record<string, CachePolicy>;

type DocucacheInitOptions = {
  getCacheType?: (document: Document) => string;
  idFields?: string[];
  typeFields?: string[];
  policies?: CachePolicies;
}

type DocucacheWrapOptions = {
  // An object or function returning an object that will be merged into the document cache.
  optimistic?: (() => any) | object;
  // A function that is called when the update fails. Generally used to rollback optimistic changes.
  rollback?: boolean | (() => void);
}

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

function defaultCacheTypeGetter(document: Record<string, string>, typeFields: string[], idFields: string[]): string {
  const id = idFields.map(field => document[field] ?? '').join('+');
  return typeFields.map(field => document[field]).find(Boolean) ?? id?.match(/^([^:]+):/)?.[1];
}

export class Docucache {

  private cache: Map<string, Document> = new Map();

  private optCache: Map<string, Document> = new Map();

  private policies: CachePolicies = {};

  private getCacheType: (document: any, typeFields: string[], idFields: string[]) => string;

  private trackStack: Set<string>[] = [];

  private idFields: string[];

  private typeFields: string[];
  
  constructor({
    getCacheType = defaultCacheTypeGetter,
    policies = {},
    typeFields = ['__typename', '_type'],
    idFields = ['_id'],
  } = {} as DocucacheInitOptions) {
    this.getCacheType = getCacheType;
    this.policies = policies;
    this.idFields = idFields;
    this.typeFields = typeFields;
  }

  /**
   * The size of the cache
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Determines if an object is a document
   */
  private isDocument(obj: any): boolean {
    // Has to be a non-null plain object
    if(!obj || Array.isArray(obj) || typeof obj !== 'object') {
      return false;
    }
    return !!this.getCacheType(obj, this.typeFields, this.idFields);
  }

  private getCacheId(document: Document) {
    const {idFields} = this;
    const type = this.getCacheType(document, this.typeFields, this.idFields);
    const policy = this.policies[type];
    return policy?.getCacheId?.(document, type, policy.idFields ?? idFields) 
      ?? defaultCacheIdGetter(document, type, idFields);
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
  resolveRef(ref: string) {
    if(!ref.startsWith('__ref:')) {
      return null;
    }
    const id = ref.slice('__ref:'.length);
    return this.get(id);
  }
  
  /**
   * Gets a document from the cache.
   */
  get<T extends object>(id: string) {
    if(!this.cache.has(id)) {
      return null;
    }
    this.trackStack.at(-1)?.add(id);
    return this.denormalize(this.cache.get(id)) as Document<T>;
  }

  /**
   * Updates a document in the cache. The updater will receive a denormalized version of the document.
   */
  update<T extends object>(
    document: Document<T> | string, 
    updater: (document: Document<T>) => Document | Document[] | void,
  ) {
    const id = this.resolveId(document);
    const current = this.denormalize(this.get(id)) as Document<T>;
    const updated = updater(current) ?? current;
    this.addAll(this.extract(updated));
  }

  /**
   * Tracks usage of documents in the cache given a synchronous function.
   */
  track<T>(fn: () => T): [T, string[]] {
    this.trackStack.push(new Set());
    const result = fn();
    const ids = this.trackStack.pop();
    return [result, [...ids]];
  }

  /**
   * Add a document to the cache. Document references will be normalized but not automatically added to the cache.
   */
  add<T extends object>(document: Document<T>) {
    const id = this.getCacheId(document);
    const normalized = this.normalize(document);
    const current = this.cache.get(id);
    const newValue = Object.assign(current ?? {}, normalized);
    this.cache.set(id, newValue);
  }

  /**
   * Add multiple documents to the cache
   */
  addAll(documents: Document[]) {
    documents.forEach(document => this.add(document));
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

  /**
   * Extracts the documents from the given object, no matter how deeply nested, and adds them to the cache.
   */
  extractAndAdd(obj: any) {
    this.addAll(this.extract(obj));
  }

  private extractAndAddOptimistic(obj: any) {
    const documents = this.extract(obj);
  }

  /**
   * Add an object to the cache and treat it as a document. Useful for caching the result of an HTTP request.
   * Note that this will not merge the object with the existing document and will overwrite it instead.
   */
  addAsDocument(obj: any, key: string) {
    this.extractAndAdd(obj);
    this.cache.set(key, this.normalize(obj));
  }

  /**
   * Runs a function and caches the result as a document.
   */
  fromResult<T>(fn: () => T, key: string): T {
    const result = fn();
    if(result instanceof Promise) {
      result.then(data => {
        this.addAsDocument(data, key);
        return data;
      });
    } else {
      this.addAsDocument(result, key);
    }
    return result;
  }

  /**
   * Remove a document from the cache.
   */
  remove(obj: Document | string) {
    const id = this.resolveId(obj);
    return this.cache.delete(id);
  }

  /**
   * Clear this cache and reset it to an empty state.
   */
  clear() {
    this.cache.clear();
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
   * Returns a denormalized version of an object, potentially resolving references.
   */
  denormalize(obj: object) {
    if(typeof obj !== 'object' || !obj) {
      return obj;
    }
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if(typeof value === 'string' && value.startsWith('__ref:')) {
        const id = value.slice('__ref:'.length);
        acc[key] = this.get(id);
      } else {
        acc[key] = this.denormalize(value);
      }
      return acc;
    }, Array.isArray(obj) ? [] : {});
  }

  /**
   * Returns a JSON-serializable representation of the cache.
   */
  export() {
    const result: {id: string, document: Document}[] = [];
    this.cache.forEach((document, id) => {
      result.push({id, document});
    });
    return result;
  }

  /**
   * Import the cache/subset of cache previously exported with `export()`.
   * This will overwrite existing documents should they have the same id.
   */
  import(items: ReturnType<this['export']>) {
    items.forEach(({id, document}) => {
      this.cache.set(id, document);
    });
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
}
