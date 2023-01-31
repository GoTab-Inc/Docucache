import * as z from 'zod';
import {reactive, Reactive} from './reactively';

interface Schema {
  parse: (data: any) => any;
}

type TriggerContext<T> = {}

interface Trigger<T> {
  before?: (ctx: TriggerContext<T>) => any;
  after?: (ctx: TriggerContext<T>) => any;
  watch?: (keyof T)[];
}

type Operation<T> = (...args: any[]) => any;

interface DocumentConfig<T, Ops = {[key: string]: Operation<T>}> {
  schema?: Schema;
  parse?: (data: T) => any;
  operations?: Ops;
  triggers?: Trigger<T>[];
}

interface Constructor<M> {
  new (...args: any[]): M
}

export function Document<T, Ops = {[key: string]: Operation<T>}>(
  {
    schema = {parse: (data) => data},
    operations,
    triggers = [],
  }: DocumentConfig<T> = {},
) {
  class Doc {
    private doc: T;

    private initialize(data: T) {
      const parsed = schema.parse(data);
      this.doc = parsed;
      Object.keys(parsed).forEach((key) => {
        Object.defineProperty(this, key, {
          get: () => {
            if(!(this.doc[key] instanceof Reactive)) {
              this.doc[key] = reactive(this.doc[key]);
            }
            return this.doc[key].get();
          },
          set: (value) => {
            if(!(this.doc[key] instanceof Reactive)) {
              this.doc[key] = reactive(this.doc[key]);
            }
            this.doc[key].set(value);
          },
        });
      });
      // Set up the triggers
      triggers.forEach((trigger) => {
        reactive(() => {
          const updates: any = {}
          for(const key of trigger.watch) {
            updates[key] = (this.doc[key] as Reactive<T[keyof T]>).get(); 
          }
          return {
            current: this.toObject(), 
            updates: {...this.toObject(), ...updates}
          };
        });
      });
    }

    private runTriggers() {

    }

    toObject(): T {
      return JSON.parse(JSON.stringify(this.doc));
    }

    transaction(fn) {
      // TODO: grab a snapshot from docucache
      // run the function
      fn();
      // start a transaction
    }
    
    static from<U extends Doc>(this: Constructor<U>, data: T) {
      const doc = new this();
      doc.initialize(data);
      return doc as U & T & Ops;
    }
  }
  // Add operations to class prototype
  Object.keys(operations || {}).forEach((key) => {
    Doc.prototype[key] = function(...args: any[]) {
      // Runs operations in a reactive context (note that this should _not_ be async)
      return operations[key].call(this, ...args);
    };
  });
  return Doc;
}

const PostSchema = z.object({
  _id: z.string(),
  name: z.string(),
  likes: z.number().default(0),
});

const Post = Document<z.infer<typeof PostSchema>>({
  schema: PostSchema,
  operations: {
    addLike() {
      console.log(this);
      console.log('liked');
      return true;
    }
  },
  triggers: [
    {
      watch: ['likes'],
      before() {
        console.log('before', this.toObject())
      },
      after() {
        console.log('after', this.toObject())
      }
    }
  ]
});

const post = Post.from({_id: 'string', name: 'Generic Pet'});

const added = post.addLike();
console.log({added});
