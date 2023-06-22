# Doculord

Doculord is a small library for creating type-safe client-side document-based local-first collaborative applications.

Doculord extends the declarative nature of client-side frameworks to resource management. 

Doculor is especially crafted for handling optimistic updating patterns in a framework agnostic manner.

## Usage

The idea is to declare the state that you would like a resource to be in and doculord will put your resources in that state using a methodology _you_ define.

For example, say you have a `Post` document and you want to add a like to it. Adding a like will call an api endpoint while and optimistically update the value on the frontend. If the update fails the like will be rolled back.

The magic is in the expressive document action building configuration

```ts
import {Document} from '@docucache/doculord';

const Post = Document<{name: string, likes: 0, isLikedByMe: boolean}>();

Post.action('incrementLike') // A name for the action plus additional context such as a controller
  .when({isLikedByMe: {equalTo: true}}) // the trigger condition
  .preApply((post) => {
    return {...post: like: post.likes + 1};
  }) // perform additional optimistic updates when triggered (it's ideal not to trigger other actions)
  .apply(async ({name}) => {
    const response = await fetch(`api/posts/${name}/add-like`);
    if(!response.ok) {
      throw new Error();
    }
    // Feel free to update other documents here if you need to
  })
  .rollback() // no arg = default rollback (undo all changes made in preApply and apply)
  .retry(4, 1000) // if the response fails, queue a number of retries with a linear 1 second delay
```

Now to trigger the update, this is all you need to do:

```js
post.isLikedByMe = true;
```

### Detecting conflicts

Use the `checkConflicts` method when initiating an action. If this function throws or returns anything other than `true` or `undefined` then the request will be rolled back with the result of the method call as the reason for the rollback. 

### creating documents

The object returned from a call to `Document` is a function that accepts an object and returns a document store.

```js
const post = Document({name: 'Why documents are awesome'});
```

Subscribe to changes in the store by calling `store.subscribe`.
Set a value in the store by calling `store.set`.
Get a snapshot state from the current state of the store by calling `store.snapshot`. 

### Loading states

Each store maintains a queue of ongoing operations. To wait for a store to finish operating, await the store itself after performing an update.

```js
post.isLikedByMe = true;
await post; // waits until the most recent update is finished. Returns a snapshot of the post
```

### Mobx/Redux compatability

By default doculord uses reactively as the reactive system, however this can be configured with an observability adapter.

This adapter is really just an object with a method for making/de-making an observable object and a method for subscribing.

```js
import {toJS, observe} from 'mobx';

const Post = new Document({
  adapter: {
    // Should return an imuttable object
    makeSnapshot(obj) {
      return toJS(obj);
    },
    // Should return a mutable object. Not every adapter will use this method
    getObservable(obj) {
      return makeAutoObservable(obj)
    },
    // Called for each registered action
    subscribe(observable, properties, fn) {
      return observe(observable, fn);
    }
  }
});

const postStore = Post({...});
const post = postStore.mutable(); // A mobx store
post.likedByMe = true; // if post is an observable, then this is expected to automatically trigger updates, but
postStore.set(post); // this is an alternative way of triggering an update if the framework requires it
```

### Integrating with existing mutation functions

It may be the case that you already have methods for mutating your objects defined in a class somewhere and it'd be a big hassle to move the method into the document action.

When creating a document store, you can optionally add attach a context to the store which can contain functions and other properties.


```js

const Post = Document({
  context: MyPostsController
});

// Pass in a string to apply and it will try to find a function by that name in the context and call it 
Post.action('incrementLike')
  .when({isLikedByMe: {becomes: true}})
  .apply('likePost');

// withContext sets the value of `this` to the context itself
Post.action('decrementLike')
  .apply(function (post) {
    console.log(this); // MyPostsController
  });

class MyPostsController {
  async getPost(): Post {
    const response = await fetch(...);
    const data = await response.json();
    const store = Post(data).withContext(this);
    post = store.mutable();
    return post;
  }

  // Automatically called
  likePost(post) {
    await fetch(...);
  }

}

```

## When should I apply optimistic updates

There are 3 situations where you _don't_ want to 
1. The API is _really_ slow
  - The user would have time to navigate elsewhere and probably lose any changes they made
  - This can also be solved by queuing requests and handling them later or handling them in a service worker