declare module "stores/idb" {
    import type { Store } from "stores/index";
    export class IDBStore implements Store {
        subscribe(id: string, callback: (document: any) => void): () => void;
        export(): Promise<{
            id: string;
            document: any;
        }[]>;
        has(key: string): Promise<boolean>;
        size(): Promise<number>;
        get(key: string): Promise<any>;
        set(key: string, value: any): Promise<void>;
        delete(key: string): Promise<void>;
        clear(): Promise<void>;
    }
}
declare module "stores/mem" {
    import type { Document } from "index";
    import type { Store } from "stores/index";
    export class MemoryStore implements Store {
        private store;
        private emitter;
        private updatedRefQueue;
        private flushQueue;
        subscribe(id: string, callback: (document: any) => void): () => void;
        size(): Promise<number>;
        get(key: string): Promise<any>;
        has(key: string): Promise<boolean>;
        set(key: string, value: any): Promise<void>;
        delete(key: string): Promise<void>;
        clear(): Promise<void>;
        export(): Promise<{
            id: string;
            document: Document;
        }[]>;
    }
}
declare module "stores/index" {
    export interface Store {
        get(key: string): Promise<any>;
        set(key: string, value: any): Promise<void>;
        delete(key: string): Promise<void>;
        has(key: string): Promise<boolean>;
        size(): Promise<number>;
        clear(): Promise<void>;
        export(): Promise<{
            id: string;
            document: any;
        }[]>;
        subscribe(id: string, callback: (document: any) => void): () => void;
    }
    export * from "stores/idb";
    export * from "stores/mem";
}
declare module "index" {
    import EventEmitter from 'eventemitter3';
    export type Document<T extends object = {}> = T;
    export type CachePolicy = {
        /**
         * A function used to determine the cache id of a document.
         * The default is to use getType and getId to construct a string in the format "type:id".
         * If a null is returned, the document will not match this policy
         */
        getCacheId?: (document: Document, type: string, idFields: string[]) => string | null;
        /**
         * A function used to determine the id of a document. The default is to search for an id field in the document.
         */
        getId?: (document: Document, idFields: string[]) => string;
        /**
         * A function used to determine if a document matches this policy.
         */
        isType?: (document: Document) => boolean | null | undefined;
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
        /**
         * A custom function to get the type of a document.
         * If `null` is returned, the object is assumed to not be a document
         * An error will be thrown if neither a string nor null is returned
         */
        getDocumentType?: (document: Document) => string | null;
        /**
         * A custom list of fields to use to extract the id from the document.
         * These will be checked in order and the first non-null value will be used.
         * The default is `['__id', '_id', 'id']`
         */
        idFields?: string[];
        /**
         * A custom list of fields to use to extract the type from the document.
         * The default is `['__typename', '_type']`
         */
        typeFields?: string[];
        policies?: CachePolicies;
    };
    type DocucacheWrapOptions = {
        optimistic?: (() => any) | object;
        rollback?: boolean | (() => void);
    };
    type StoreResolveOpts = {
        throwIfMissing?: boolean;
        onMissingValue?: (id: string) => Promise<any>;
    };
    export const Missing: unique symbol;
    export class DocuStore {
        private store;
        private pendingUpdateTimeout;
        private pendingUpdates;
        /**
         * A singleton emitter for all the cache events
         */
        private emitter;
        private policies;
        private getDocumentType;
        private idFields;
        private typeFields;
        constructor({ getDocumentType, policies, typeFields, idFields, }?: DocucacheInitOptions);
        private notifyChanges;
        private getTypeOfDocument;
        private getPolicyForType;
        flushPendingUpdates(): void;
        flushed(): Promise<void>;
        /**
         * The size of the cache
         */
        size(): Promise<number>;
        /**
         * Determines if an object is a document
         */
        private isDocument;
        /**
         * Given a document or object, try to determine the cacheId
         */
        private getCacheId;
        private getShape;
        private isDocumentOrRef;
        private resolveType;
        private getRef;
        /**
         * Resolve a string, ref, or document to an id
         */
        resolveId(obj: string | Document): string;
        /**
         * Resolve a reference to a document
         */
        resolveRef<T extends object>(ref: string, opts?: StoreResolveOpts): Promise<T>;
        /**
         * Resolves a document from the cache using the store.
         * The document will be denormalized and references will be resolved as well.
         */
        resolve<T extends object>(id: string, opts?: StoreResolveOpts): Promise<T>;
        /**
         * Updates a document in the cache. The updater will receive a denormalized version of the document.
         */
        update<T extends object>(document: Document<T> | string, updater: (document: Document<T>) => Document | Document[] | void): Promise<void>;
        /**
         * Add a document to the cache. Document references will be normalized but not automatically added to the cache.
         */
        add<T extends object>(document: Document<T>): Promise<void>;
        /**
         * Add multiple documents to the cache
         */
        addAll(documents: Document[]): Promise<void>;
        /**
         * Extract the documents from any object, no matter how deeply nested
         */
        extract(obj: any): any;
        extractRefs(obj: any): string[];
        /**
         * Extracts the documents from the given object, no matter how deeply nested, and adds them to the cache.
         */
        extractAndAdd(obj: any): Promise<void>;
        private extractAndAddOptimistic;
        /**
         * Add an object to the cache and treat it as a document. Useful for caching the result of an HTTP request.
         * Note that this will not merge the object with the existing document and will overwrite it instead.
         */
        addAsDocument(obj: any, key: string): Promise<void>;
        /**
         * Runs a function and caches the result as a document.
         */
        fromResult<T>(fn: () => T, key: string): Promise<T>;
        /**
         * Remove a document from the cache.
         */
        remove(obj: Document | string): Promise<void>;
        /**
         * Clear this cache and reset it to an empty state.
         */
        clear(): Promise<void>;
        /**
         * Returns a normalized version of an object, replacing any documents with references.
         * Unlike in GraphQL documents can be arbitrarily nested within other documents so this recursively normalizes the entire object.
         */
        normalize(obj: object): {};
        /**
         * Returns a denormalized version of any object, resolving all references.
         */
        denormalize<T extends any>(obj: any): Promise<T>;
        /**
         * Returns a JSON-serializable representation of the cache.
         */
        export(): Promise<{
            id: string;
            document: any;
        }[]>;
        /**
         * Import the cache/subset of cache previously exported with `export()`.
         * This will overwrite existing documents should they have the same id.
         */
        import(items: Awaited<ReturnType<this['export']>>): Promise<void>;
        /**
         * Run a function and cache the result of any documents returned.
         * Other settings can be passed to control the behavior of the cache such as optimstic updates.
         */
        wrap<T>(fn: () => Promise<T>, options?: DocucacheWrapOptions): Promise<T>;
        subscription<T = any>(doc: any): EventEmitter<"update" | "create" | "delete", T>;
    }
    export const Docucache: typeof DocuStore;
}
//# sourceMappingURL=main.d.ts.map