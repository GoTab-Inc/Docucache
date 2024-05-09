export interface Store {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  size(): Promise<number>;
  clear(): Promise<void>;
  export(): Promise<{id: string, document: any}[]>;
}

export * from './idb';
export * from './mem';
