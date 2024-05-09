// indexeddb backend for docucache
import type {Store} from './';

export class IDBStore implements Store {
  export(): Promise<{ id: string; document: any; }[]> {
    throw new Error('Method not implemented.');
  }
  has(key: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  size(): Promise<number> {
    throw new Error('Method not implemented.');
  }
  get(key: string): Promise<any> {
    throw new Error('Method not implemented.');
  }
  set(key: string, value: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
  delete(key: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  clear(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}