// The base adapter uses reactively as the reactive system
import type {ObservableAdapter} from './types';

const BaseAdapter: ObservableAdapter = {
  getSnapshot<T>(doc: any): Promise<any> {
    throw new Error('Function not implemented.');
  },
  getMutable<T>(doc: any): Promise<any> {
    throw new Error('Function not implemented.');
  },
  subscribe<T>(doc: any, fn: (doc: any) => void): () => void {
    throw new Error('Function not implemented.');
  }
}
