export class MemoryStore {
    store: Map<any, any>;
    emitter: Emitter<string | symbol, any>;
    updatedRefQueue: any[];
    flushQueue(): void;
    subscribe(id: any, callback: any): () => void;
    size(): Promise<number>;
    get(key: any): Promise<any>;
    has(key: any): Promise<boolean>;
    set(key: any, value: any): Promise<void>;
    delete(key: any): Promise<void>;
    clear(): Promise<void>;
    export(): Promise<any[]>;
}
import Emitter from "eventemitter3";
