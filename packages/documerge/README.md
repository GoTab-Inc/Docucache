# @docucache/documerge

Combines docucache with [automere](https://www.npmjs.com/package/@automerge/automerge).

### Usage

Create an operation to describe specific changes to a document

```ts
// The updater here might require a special syntax for running nested operations? Ultimately an array of changes is returned...
const changePostStatus = Operation<typeof postSchema>((post, {status}) => {post.status = status});
const post = cache.get('post:1234');
const changes = changePostStatus(post, {status: 'PUBLISHED'});
```

Operations can be used as an optimistic update strategy in a request library as well.
Combining optimistic updates, an offline request cacher, and other facets will allow you to create a productive offline application
with eventual syncing. It is recommended to abstract all of this into your sdk.

```js
async function getPost(postId) {
  if(cache.has(postId)) {
    return cache.get(postId);
  }
  const response = await fetch(`/posts/${postId}`);
  const post = cache.cache(await response.json());
  return post;
}

function updatePost(post, {description}) {
  return cache.wrap(async () => {
    const response = await fetch(`/posts/post/${post.postId}`, {body: {description}});
    return response.json();
  }, {
    // This optimistic update is used to describe what you _think_ should happen when the request completes
    // When an Operation is used here it generates a set of document changes as well. These changes can be sent to peers through various means.
    optimistic: Operation(post, (updated) => {
      updated.description = description;
      updated.lastUpdated = Date.now();
    })
  });
}

// In your ui component you use getPost and updatePost as normal
const post = await getPost('post:1234');
updatePost(post, {description: 'Hello, World!'});
```

Locally, messages should be stored in another table (indexeddb?)
