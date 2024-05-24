// Combines tanstack query with docucache to provide a fine-grained reactive query system
import {
  QueryClient,
  type FetchQueryOptions,
  type InvalidateQueryFilters,
  type InvalidateOptions,
  type QueryObserverResult,
  QueryObserver,
} from '@tanstack/query-core';
import {DocuStore, type DocucacheInitOptions } from '@docucache/docucache';

const docOpKeySymbol = Symbol.for('__DocOpKey');

type DocuQueryClientConfig = {
  queryClient?: QueryClient;
  store?: DocuStore;
} & DocucacheInitOptions;

type DocuOperationConfig<T extends any[], R> = {
  operationFn: (...args: T) => R;
  operationKey: ReadonlyArray<unknown> | ((...args: T) => ReadonlyArray<unknown>);
  invalidate?: {filters: InvalidateQueryFilters, options?: InvalidateOptions} | InvalidateQueryFilters,
} & Omit<FetchQueryOptions<unknown, unknown>, 'queryKey' | 'queryFn'>;

type OpFn<T extends any[], R> = ((...args: T) => Promise<R> | R) & {
  [docOpKeySymbol]?: ReadonlyArray<unknown> | ((...args: T) => ReadonlyArray<unknown>);
  subscribe: (cb: (result :QueryObserverResult) => void) => () => void;
};

class DocuQueryClient {
  private queryClient: QueryClient;
  private store: DocuStore;
  
  constructor(options: DocuQueryClientConfig = {}) {
    const {
      queryClient,
      store,
      ...docucacheOptions
    } = options;
    this.store = store || new DocuStore(docucacheOptions);
    this.queryClient = queryClient || new QueryClient();
    this.init();
  }

  private init() {
    // When the state of a query changes we will update the docustore
    this.queryClient
      .getQueryCache()
      .subscribe(({type, query: {queryKey, state}}) => {
        // TODO: if you have staleTime set, will this cause the store to be updated with stale data in some scenarios?
        if(queryKey[0] !== 'op') {
          return;
        }
        this.store.addAsDocument(state, queryKey.join(':'));
        // TODO: the documents here are now also bound to the query
        // We need to ensure that when any of those documents are updated, a notification is sent to the operation trigger as well
        // Perhaps the store needs another function to bind update events of documents together?
      });
    // this.queryClient
    //   .getMutationCache()
    //   .subscribe(({type, mutation}) => {
    //     if(queryKey[0] !== 'op') {
    //       return;
    //     }
    //     this.store.addAsDocument(state, queryKey.join(':'));
    //   });
  }

  operation<T extends any[], R>(config: DocuOperationConfig<T, R>) {
    let unsubscribe: () => void;
    let callback: ((result: QueryObserverResult) => void) | null;
    let observer: QueryObserver<R, Error, unknown, unknown, readonly unknown[]>;
    const op: OpFn<T, R> = (...args: T) => {
      let operationKey = config.operationKey;
      if(typeof config.operationKey === 'function') {
        operationKey = config.operationKey(...args);
      }
      operationKey = ['op', ...operationKey as ReadonlyArray<unknown>]
      const queryKey = operationKey;
      const queryFn = async () => {
        try {
          const result = await config.operationFn(...args);
          if(config?.invalidate) {
            const filters = 'queryKey' in config.invalidate ? config.invalidate : (config.invalidate as any).filters;
            const options = 'queryKey' in config.invalidate ? {} : (config.invalidate as any).options;
            await this.queryClient.invalidateQueries(filters, options)
          }
          return result;
        } catch(err) {
          // TODO: implement rollback? This might need to be in the queryClient subscription instead??
          throw err;
        }
      };
      if(!observer) {
        observer = new QueryObserver(this.queryClient, {queryKey, queryFn});
      }
      observer.setOptions({queryKey, queryFn});
      // Unsubscribe an reregister automatically
      if(callback) {
        unsubscribe?.();
        unsubscribe = observer.subscribe(callback);
      }
      return this.queryClient.fetchQuery({queryKey, queryFn});
    };
    op[docOpKeySymbol] = config.operationKey;
    op.subscribe = (cb) => {
      callback = cb;
      unsubscribe = observer.subscribe(cb);
      // Return it like this because unsubscribe can change based on each call
      return () => {
        unsubscribe();
        callback = null; // Clear this if manually unsubscribed
      }
    }
    return op;
  }

  snapshot(doc: any) {
    // given a document, hydrate it with the latest data from the docucache store
    return this.store.denormalize(doc);
  }

  subscription<T = any>(doc: any) {
    return this.store.subscription(doc);
  }

  private getOperationKey(op: OpFn<any, any> | string): ReadonlyArray<unknown> | null {
    if(Array.isArray(op)) {
      return op;
    }
    if(typeof op === 'string') {
      if(op.startsWith('op')) {
        return op.split(':');
      }
      return null;
    }
    if(op[docOpKeySymbol]) {
      if(!Array.isArray(op[docOpKeySymbol])) {
        throw new Error('Operation key must be a static array');
      }
      return ['op', ...op[docOpKeySymbol]];
    }
    return null;
  }

  subscribe<T = any>(doc: any, callback: (doc: T) => void) {
    const opKey = this.getOperationKey(doc);
    const subscriptionRef = opKey ? `__ref:${opKey.join(':')}` : doc;
    const subscription = this.store.subscription(subscriptionRef);
    const callbackFn = async () => {
      // Always retrieve the latest snapshot of the document
      const snapshot = await this.snapshot(subscriptionRef);
      callback(snapshot as T);
    };
    subscription.on('create', callbackFn);
    subscription.on('update', callbackFn);
    subscription.on('delete', callbackFn);
    return () => {
      subscription.off('create', callbackFn);
      subscription.off('update', callbackFn);
      subscription.off('delete', callbackFn);
    };
  }
}

// This factory function is used so that users can create mockes in their tests
export function createClient(options?: DocuQueryClientConfig) {
  return new DocuQueryClient(options);
}