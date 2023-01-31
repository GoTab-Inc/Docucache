# Doculord

Doculord is a little framework for creating type-safe client-side document-based local-first collaborative applications.

Doculord extends the declarative nature of client-side frameworks to resource management. 

The idea is to declare the state that you would like a resource to be in and doculord will carefully figure out how to put your resources in that state using a methodology _you_ define.

Modifications are made on document fields which then get translated into actions that handle automatic optimistic updates w/ rollback, document caching, and syncing between multiple clients with easy conflict resolution.

## Usage

Define a document using the `Document` function by passing in a schema and configurations. 
A schema is any object that has a `parse` function.

```js
import * as z from 'zod';
import {Document, Operation} from '@docucache/doculord';

const PetSchema = z.object({
  _id: z.string(),
  name: z.string(),
});

const Pet = Document<z.infer<PetSchema>>(
  PetSchema,
  {
    operations: {
      updateUser: Operation(),
    },
  }
);
```

Alternatively you can extend the result of Document if you prefer a more Object-Oriented approach.

In this case, you can use decorators to define operations.

```js
class Pet extends Document<z.infer<PetSchema>>() {

}
```

### Operations

An operation is an action that gets taken when fields are updated. Operations take an updater function and configurations that determine when and how the operation will run. Properties include

- `when` - An array of keys on the object in which to detect changes _or_ a predicate function that when `true` will run the operation.
- `group` - When `true` will only run the operation if the group is 

### Loading states

Doculord maintains a global queue that contains information about all ongoing operations.
At any point in time you can await for a document to finish be modified by calling await on the document itself.

```js
post.title = 'Another title';
```

## Examples

The most basic example would be updating a value. For example, adding a like to a post.

```js
import * as zod from 'zod';

const Post = Document<{_id: string, name: string, likes: number}>({
  operations: {
    updateLikes: Operation(
      async (ctx) => {
        // Perform an optimistic update
        ctx.optimistic.likes = ctx.current.likes;
        // Do the actual request
        const response = await fetch(`/api/posts/${ctx.current._id}`);
        if(!response.ok) {
          throw new Error('Unable to add a like!');
        }
      },
      ['likes']
    ),
  }
});

const post = Post.from({name: 'Why Documents are magic', likes: 0});

async function addLike() {
  if(post.isLikedByMe) {
    return false;
  }
  post.transaction(() => {
    post.likes++;
  });
}

```

Sometimes you need to modify multiple resources at the same time. This can be done using a transaction.

```js
import {transaction} from 'transactions';
transaction(() => {
  
});
```

### Usage with tanstack/query

tanstack/query does not necessarily care about _how_ properties are updated