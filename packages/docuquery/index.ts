// Combines tanstack query with docucache to provide a fine-grained reactive query system

import EventEmitter from "eventemitter3";
import {QueryClient, type FetchQueryOptions} from '@tanstack/query-core';
import {Docucache, type DocucacheInitOptions } from '@docucache/docucache';

type DocuQueryClientConfig = {
  queryClient?: QueryClient;
  docucache?: Docucache;
} & DocucacheInitOptions;

type DocuOperationConfig<T extends any[], R> = {
  operationFn: (...args: T) => R;
  operationKey: ReadonlyArray<unknown> | ((...args: T) => ReadonlyArray<unknown>);
} & Omit<FetchQueryOptions<unknown, unknown>, 'queryKey' | 'queryFn'>;

class DocuQueryClient {
  private queryClient: QueryClient;
  private store: Docucache;
  
  constructor(options: DocuQueryClientConfig) {
    const {
      queryClient,
      docucache,
      ...docucacheOptions
    } = options;
    this.store = options.docucache || new Docucache(docucacheOptions);
    this.queryClient = options.queryClient || new QueryClient();
  }

  // tanstack query requires a unique id to identify queries and mutations
  // If the object is a ref string or a document, we will use the ref as the id
  // If the object is any other object, we will get all the ref strings, sort them lexicographically, and use that as the id
  private getSubscriptionId(doc: any) {
    
  }
  
  operation<T extends any[], R>(config: DocuOperationConfig<T, R>) {
    return (...args: T) => {
      let operationKey = config.operationKey;
      if(typeof config.operationKey === 'function') {
        operationKey = config.operationKey(...args);
      }
      return this.queryClient.fetchQuery<R>({
        queryKey: operationKey as ReadonlyArray<unknown>,
        queryFn: async () => {
          try {
            const result = await config.operationFn(...args);
            // TODO: cache
            return result;
          } catch(err) {
            throw err;
          }
        },
      });
    }
  }

  snapshot(doc: any) {
    // given a document, hydrate it with the latest data from the docucache store
    return this.store.denormalize(doc);
  }

  subscription<T = any>(doc: any) {
    return this.store.subscription(doc);
  }

  subscribe<T = any>(doc: any, callback: (doc: T) => void) {
    const subscription = this.store.subscription(doc);
    const callbackFn = async (doc: any) => {
      const snapshot = await this.snapshot(doc);
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
export function createClient(options: DocuQueryClientConfig) {
  return new DocuQueryClient(options);
}