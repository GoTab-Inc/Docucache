# offline-buffer

Detects when the current device has gone offline and automatically queues requests for retry when reconnected.

## Usage

```ts
import type {Configuration} from '@restfools/offline-mode';

const config: Configuration = {
  maxOfflineRequests: Infinity,
  requests: [
    {
      matches: ({url, body}) => true, // matches every request
      maxOfflineRequests: 2, // how many requests matched by this matcher are allowed before throwing an error
      keepLast: 1, // keep only the most recent n requests
      keepFirst: 1, // keep only the first n requests
    }
  ]
};
// you can register the config globally if you desire by using `globalConfig(config)`
```

You can either monkey-patch the native fetch object:

```js
import {patchFetch} from '@restfools/offline-mode';

const unPatch = patchFetch(config);
```

Or wrap an object conforming to the `fetch` api.

```js
import {createFetch} from '@restfools/offline-mode';

const fetch = createFetch(config, window.fetch); // both params are optional 
```

Now there's a few options for managing offline behavior.

The most basic behavior would be to check if you're offline before performing any requests, and if you are offline
you could return a cached response or throw an error:

```js
import {isOffline} from '@restfool/offline-mode';

function getPost(id) {
  if(isOffline()) {
    return cache.get(`Post:${id}`) ?? new Error('Offline');
  }
  return fetch(`/posts/${id}`);
}
```

Another alternative could be to await until the network is online to resolve a fetch request. This is usually more useful for GET requests
or requests that don't modify resources.

```js
import {isOffline, waitUntilOnline} from '@restfool/offline-mode';

async function getPost(id) {
  await waitUntilOnline();
  const response = await fetch(`/posts/${id}`;
  return response.json();
}
```

A final method is to await the specific response after performing some optimistic updates.

```js
const posts = {0: {name: 'Hello, World!', description: 'My first post'}}

async function updatePost(id, {description}) {
  const originalDescription = posts[id].description;
  posts[id].description = description; // optimistic update
  const response = await fetch(`/posts/${id}`, {method: 'POST', body: {description}});
  await response.waitUntilResolvedOnline();
  if(response.ok) {
    posts[id] = await response.json();
  } else {
    // Rollback due to an error
    posts[id] = originalDescription;
  }
}
```

A further optimization is to use a signal to cancel the request.

### Request Batching

Not supported yet, but may be in the future.

### Websockets/Socket.io

If you want to use offline functionality with something besides http