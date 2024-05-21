import {
  DocuQuery,
  DocuQueryFn,
  DocuQueryKey,
  DocuQuerySubscriptionFn,
} from './query';

type DocuQueryVariables = any;
type DocuClientOptions = {
  staleTime?: number;
  cache?: DocuCache;
}
export type MutateOptions = {
  mutateFn: () => Promise<any>,
  onMutate?: () => void,
  onSuccess?: (data: any) => void,
  onError?: (error: Error) => void,
}

export type DocuData = {
  __typename: string;
  _id: string;
  _expiresAt: number;
  [key: string]: any;
}

interface DocuCache {
  get(key: DocuQueryKey): DocuData;
  set(key: DocuQueryKey, value: any): DocuData;
  invalidate(key: DocuQueryKey): void;
}

class DocuCache implements DocuCache {
  private store = new Map<DocuQueryKey, DocuData>();

  constructor(private staleTime: number = 0) {}

  get(key: DocuQueryKey) {
    const data = this.store.get(key);
    const now = Date.now();
    if(data && data._expiresAt > now) {
      return data;
    }
    return undefined;
  }

  set(key: DocuQueryKey, value: DocuData) {
    if(!value._expiresAt) {
      value._expiresAt = Date.now() + this.staleTime;
    }
    this.store.set(key, value);
    return value;
  }

  invalidate(key: string): void {
    const data = this.store.get(key);
    const now = Date.now();
    if(data) {
      data._expiresAt = now;
      this.store.set(key, data);
    }
    // Normalized store should propagate downwards
  }
}

let client;

export class DocuClient {
  private cache: DocuCache;
  private staleTime: number;
  private queryMap = new Map<DocuQueryKey, DocuQuery>;

  constructor(options?: DocuClientOptions) {
    this.staleTime = options?.staleTime || 0;
    this.cache = options?.cache || new DocuCache(this.staleTime); // Replace with real cache
  }

  getOrCreateQuery(
    queryKey: DocuQueryKey,
    queryFn: DocuQueryFn,
    variables: any,
    client: DocuClient,
  ) {
    let docuQuery = this.queryMap.get(queryKey);
  
    if(!docuQuery) {
      docuQuery = new DocuQuery(queryKey, queryFn, variables, client);
      this.queryMap.set(queryKey, docuQuery);
    }
  
    return docuQuery;
  }
  
  async query({
    queryKey,
    queryFn,
    variables,
  }: {
    queryKey: DocuQueryKey,
    queryFn: DocuQueryFn,
    variables: DocuQueryVariables,
  }) {
    const docuQuery = this.getOrCreateQuery(queryKey, queryFn, variables, this);
    const result = await docuQuery.fetch();
    return result;
  }

  subscribe({
    queryKey,
    queryFn,
    variables,
  }: {
    queryKey: DocuQueryKey,
    queryFn: DocuQueryFn,
    variables: DocuQueryVariables,
  }, subscriber: DocuQuerySubscriptionFn) {
    const docuQuery = this.getOrCreateQuery(queryKey, queryFn, variables, this);

    return docuQuery.subscribe(subscriber);
  }

  async mutate(options: MutateOptions) {
    const {
      mutateFn,
      onMutate,
      onSuccess,
      onError,
    } = options;

    if(onMutate) {
      onMutate();
    }

    return mutateFn()
      .then((data) => {
        if(onSuccess) {
          onSuccess(data);
        }

        return data;
      })
      .catch((error) => {
        if(onError) {
          onError(error);
        }
      });
  }

  getCache() {
    return this.cache;
  }

  getQueryData(queryKey: DocuQueryKey) {
    const data = this.cache.get(queryKey);
    return data;
  }

  setQueryData(queryKey: DocuQueryKey, data: DocuData) {
    this.cache.set(queryKey, data);
    // Notify subscribers
    const docuQuery = this.queryMap.get(queryKey);
    if(docuQuery) {
      docuQuery.setState({data});
    }
  }
}

export function getClient(options?: DocuClientOptions): DocuClient {
  if(!client) {
    client = new DocuClient(options);
  }
  
  return client;
}