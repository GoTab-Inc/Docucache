// In memory store. This is more-or-less just a JS Map
import type { Document } from '..';
import type {Store} from './';

export class MemoryStore implements Store {
  private store = new Map<string, Document>();
  
  size() {
    return Promise.resolve(this.store.size);
  }

  get(key: string): Promise<any> {
    return Promise.resolve(this.store.get(key));
  }

  has(key: string): Promise<boolean> {
    return Promise.resolve(this.store.has(key));
  }

  set(key: string, value: any): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }

  export(): Promise<{id: string, document: Document}[]> {
    const result: {id: string, document: Document}[] = [];
    // TODO: change this to a generator
    this.store.forEach((document, id) => {
      result.push({id, document});
    });
    return Promise.resolve(result);
  }
}
