declare module "src/stores/idb" {
    import type { Store } from "src/stores/index";
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
declare module "src/stores/mem" {
    import type { Document } from "src/index";
    import type { Store } from "src/stores/index";
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
declare module "src/stores/index" {
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
    export * from "src/stores/idb";
    export * from "src/stores/mem";
}
declare module "src/index" {
    export type Document<T extends object = {}> = T;
    export type CachePolicy = {
        getCacheId?: (document: Document, type: string, idFields: string[]) => string;
        idFields?: string[];
    };
    type CachePolicies = Record<string, CachePolicy>;
    type DocucacheInitOptions = {
        getDocumentType?: (document: Document) => string;
        idFields?: string[];
        typeFields?: string[];
        policies?: CachePolicies;
        autoRemoveOrphans?: boolean;
    };
    type DocucacheWrapOptions = {
        optimistic?: (() => any) | object;
        rollback?: boolean | (() => void);
    };
    type StoreResolveOpts = {
        throwIfMissing?: boolean;
        onMissingValue?: (id: string) => Promise<any>;
    };
    export class Docucache {
        private store;
        private policies;
        private getDocumentType;
        private stats;
        private idFields;
        private typeFields;
        private autoRemoveOprhans;
        constructor({ getDocumentType, policies, typeFields, idFields, autoRemoveOrphans, }?: DocucacheInitOptions);
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
         * Remove a
         * @param id
         */
        private removeIfOprhaned;
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
         * Returns a denormalized version of an object, potentially resolving references.
         */
        private denormalize;
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
    }
}
//# sourceMappingURL=main.d.ts.map