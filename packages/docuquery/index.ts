// Combines tanstack query with docucache to provide a fine-grained reactive query system
import {
  QueryClient,
  type FetchQueryOptions,
  type InvalidateQueryFilters,
  type InvalidateOptions,
  type QueryFilters,
} from '@tanstack/query-core';
import {DocuStore, type DocucacheInitOptions } from '@docucache/docucache';

const docOpKeySymbol = Symbol.for('__DocOpKey');

type DocuQueryClientConfig = {
  queryClient?: QueryClient;
  store?: DocuStore;
} & DocucacheInitOptions;

type DocuOperationConfig<R, T extends any[]> = {
  operationFn: (...args: T) => R;
  operationName?: string;
  operationKey: ReadonlyArray<unknown> | ((...args: T) => ReadonlyArray<unknown>);
  invalidate?: {filters: InvalidateQueryFilters, options?: InvalidateOptions} | InvalidateQueryFilters,
} & Omit<FetchQueryOptions<unknown, unknown>, 'queryKey' | 'queryFn'>;

type DocuQuerySubscriptionFilters = {
  queryKey: ReadonlyArray<unknown>;
} & Omit<QueryFilters, 'queryKey'>;

type DocuQueryInvalidateOperationFilters = {
  queryKey: ReadonlyArray<unknown>;
} & Omit<InvalidateOptions, 'queryKey'>;

type OpFn<R, T extends any[]> = ((...args: T) => Promise<R>) & {
  [docOpKeySymbol]?: ReadonlyArray<unknown> | ((...args: T) => ReadonlyArray<unknown>);
  subscribe: (filters: DocuQuerySubscriptionFilters, callback?: (data: any) => void) => () => void;
  invalidate: (filters: DocuQueryInvalidateOperationFilters) => Promise<void>;
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

  operation<T extends any[], R>(config: DocuOperationConfig<R, T>) {
    const {
      operationFn,
      operationKey,
      operationName = operationFn?.name,
      ...queryOptions
    } = config;
    const op = (...args: T) => {
      const querySubKeys = typeof operationKey === 'function' ? operationKey(...args) : operationKey;
      const queryKey = ['op', operationName, ...querySubKeys];
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
      
      return this.queryClient.fetchQuery({
        ...queryOptions,
        meta: {operationName, operationKey},
        queryKey,
        queryFn,
      });
    };
    op[docOpKeySymbol] = (Array.isArray(operationKey) 
      ? [operationName, ...operationKey] 
      : [operationName]) as ReadonlyArray<unknown>;
    // When a query is invalidated we will fetch the query again. Note that this allows you to subscribe to multiple queries
    // TODO: should this allow options to be passed in to query.fetch?
    op.subscribe = (filters: DocuQuerySubscriptionFilters, callback?: (data: any) => void) => {
      const queryKey = ['op', operationName, ...filters.queryKey];
      // It's up to the end user to properly subscribe and unsubscribe from queries when they're no longer needed in order to avoid memory leaks
      // Note: 
      const unsub = this.queryClient
        .getQueryCache()
        .subscribe(async (event) => {
          // we could destructure this all at once, but these if statements are here for type narrowing
          if(event.type !== 'updated') {
            return;
          }
          const {action: {type}, query} = event;
          if(type !== 'invalidate') {
            return;
          }
          // This is a little trick to check if the query that was invalidated is one of the queries we subscribed to
          if(!this.queryClient.getQueryCache().findAll({...filters, queryKey}).includes(query)) {
            return;
          }
          const data = await query.fetch();
          callback?.(data);
        });
      return () => {
        // We might do other stuff here, not sure yet
        unsub();
      }
    };
    op.invalidate = (filters: InvalidateQueryFilters) => {
      return this.queryClient.invalidateQueries({
        ...filters,
        queryKey: ['op', operationName, ...filters.queryKey as readonly unknown[]],
      });
    };
    return op;
  }

  invalidate(filters?: InvalidateQueryFilters) {
    return this.queryClient.invalidateQueries(filters);
  }

  snapshot(doc: any) {
    // given a document, hydrate it with the latest data from the docucache store
    return this.store.denormalize(doc);
  }

  subscription<T = any>(doc: any) {
    return this.store.subscription<T>(doc);
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
    const subscription = this.store.subscription<T>(subscriptionRef);
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