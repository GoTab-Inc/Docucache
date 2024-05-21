import {
  DocuClient,
  DocuData,
  getClient,
} from './client';

export type DocuQueryFn = (variables) => Promise<any>;
export type DocuQueryKey = string;

export type DocuQueryResult = {
  data: DocuData;
  error: null | Error;
};

export type DocuQueryFnState = DocuQueryResult & {
  status: 'idle' | 'fetching' | 'success' | 'error';
  operation: Promise<any>;
}

export type DocuQuerySubscriptionFn = (state: DocuQueryFnState) => void;

export class DocuQuery {
  private subscribers = new Set<DocuQuerySubscriptionFn>();
  private state = {
    data: null,
    status: 'idle',
    error: null,
    operation: null,
  } as DocuQueryFnState;

  constructor(
    private queryKey: DocuQueryKey,
    private queryFn: DocuQueryFn,
    private variables: any,
    private client: DocuClient,
  ) {
  }

  notify() {
    this.subscribers.forEach(subscriber => {
      subscriber(this.state);
    });
  }

  setState(newState: Partial<DocuQueryFnState>) {
    this.state = {...this.state, ...newState};

    this.notify();
  }

  subscribe(subscriber: DocuQuerySubscriptionFn) {
    this.subscribers.add(subscriber);
    subscriber(this.state); // Immediately give current state;
    this.fetch();
    return () => {
      this.subscribers.delete(subscriber);
    }
  }

  async fetch() {
    const cachedData = this.client.getCache().get(this.queryKey);
    if(cachedData) {
      return cachedData;
    }
    
    try {
      // This allows multiple people to call fetch at the same time to wait for same promise
      if(this.state.status !== 'fetching') {
        this.setState({status: 'fetching', operation: this.queryFn(this.variables)});
      }
      const data = await this.state.operation;
      this.client.getCache().set(this.queryKey, data);
      this.setState({data, status: 'success', operation: null});
      // Reset status to idle after some time
      return data;
    } catch(error) {
      this.setState({status: 'error', error, operation: null});
      throw error;
    }
  }
}