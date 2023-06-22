export interface ObservableAdapter {
  getSnapshot<T>(doc: T): Promise<T>;
  getMutable<T>(doc: T): Promise<T>;
  subscribe<T>(doc: T, fn: (doc: T) => void): () => void;
}