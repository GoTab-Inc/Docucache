// src/stores/mem.ts
import Emitter from "eventemitter3";

class MemoryStore {
  store = new Map;
  emitter = new Emitter;
  updatedRefQueue = [];
  flushQueue() {
    this.updatedRefQueue.forEach((id) => {
      this.emitter.emit(id, this.store.get(id));
    });
  }
  subscribe(id, callback) {
    this.emitter.on(id, callback);
    return () => {
      this.emitter.off(id, callback);
    };
  }
  size() {
    return Promise.resolve(this.store.size);
  }
  get(key) {
    return Promise.resolve(this.store.get(key));
  }
  has(key) {
    return Promise.resolve(this.store.has(key));
  }
  set(key, value) {
    this.store.set(key, value);
    return Promise.resolve();
  }
  delete(key) {
    this.store.delete(key);
    return Promise.resolve();
  }
  clear() {
    this.store.clear();
    return Promise.resolve();
  }
  export() {
    const result = [];
    this.store.forEach((document, id) => {
      result.push({ id, document });
    });
    return Promise.resolve(result);
  }
}
export {
  MemoryStore
};
