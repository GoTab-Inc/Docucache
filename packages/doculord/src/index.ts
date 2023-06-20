import CallableInstance from 'callable-instance';

import type {Filter} from './query';

type DocumentSchemaType<T> = T extends {parse: (...args: any[]) => infer U} ? U : T;

type ApplyFunction<T> = (doc: DocumentSchemaType<T>) => Promise<void> | void;

type AcceptableSchema = {parse: (...args: any[]) => any} | object;

export interface ObservableAdapter<T> {
  getSnapshot(doc: T): Promise<T>;
  getMutable(doc: T): Promise<T>;
  subscribe(doc: T, fn: (doc: T) => void): () => void;
}

interface DocumentOptions<TSchema extends AcceptableSchema, TContext = any> {
  schema?: TSchema;
  adapter?: ObservableAdapter<DocumentSchemaType<TSchema>>;
  defaultContext?: TContext;
}


class ActionTrigger<TSchema> {
  condition: any;

  applyFn: string | ApplyFunction<TSchema>;

  preApplyFn: string | ApplyFunction<TSchema>;

  postApplyFn: string | ApplyFunction<TSchema>;

  rollbackFn: string | ApplyFunction<TSchema>;

  retryOpts: any; // TODO: type this properly later

  when(filter: Filter<DocumentSchemaType<TSchema>>) {
    this.condition = filter;
    return this;
  }

  preApply(fnOrRef: string | ApplyFunction<TSchema>) {
    this.preApplyFn = fnOrRef;
    return this;
  }

  apply(fnOrRef: string | ApplyFunction<TSchema>) {
    this.applyFn = fnOrRef;
    return this;
  }

  postApply(fnOrRef: string | ApplyFunction<TSchema>) {
    this.postApplyFn = fnOrRef;
    return this;
  }

  rollback(fnOrRef?: string | ApplyFunction<TSchema>) {
    this.rollbackFn = fnOrRef ?? 'default';
    return this;
  }

  retry(numRetries: number, retryStrategy?: {delay?: number, backoff?: number, type?: string} | number) {
    if(typeof retryStrategy === 'number') {
      retryStrategy = {delay: retryStrategy, backoff: 1500, type: 'exponential'};
    }
    this.retryOpts = {numRetries, retryStrategy};
    return this;
  }
}

class DocumentInstance<TSchema extends AcceptableSchema, TContext = any> {
  constructor(
    public document: DocumentHandler<TSchema>,
    public data: DocumentSchemaType<TSchema>,
    public context: TContext = document.defaultContext
  ) {
  }

  snapshot() {

  }

  mutable() {

  }

  subscribe() {

  }

  set() {

  }

  // Get a new instance of this document with a different context value
  withContext<T>(context: T) {
    return new DocumentInstance<TSchema, T>(this.document, this.data, context);
  }
}

class DocumentHandler<TSchema extends AcceptableSchema, TContext = any> extends CallableInstance<[DocumentSchemaType<TSchema>], DocumentInstance<TSchema, TContext>> {
  triggers: Map<string, ActionTrigger<TSchema>> = new Map();

  defaultContext: TContext;

  schema?: {parse: (...any: any[]) => any};

  constructor(
    {
      schema,
      defaultContext
    } : DocumentOptions<TSchema, TContext> = {}
    ) {
    super('from');
    this.defaultContext = defaultContext;
    this.schema = (schema as any);
  }

  action(actionName: string) {
    const trigger = new ActionTrigger<TSchema>();
    this.triggers.set(actionName, trigger);
    return trigger;
  }

  from(data: DocumentSchemaType<TSchema>) {
    return new DocumentInstance(this, data);
  }
}

export function Document<TSchema extends AcceptableSchema, TContext = any>(options?: DocumentOptions<TSchema, TContext>) {
  return new DocumentHandler<TSchema, TContext>(options);
}