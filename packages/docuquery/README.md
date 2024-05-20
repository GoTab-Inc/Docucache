# docuquery

> [!NOTE] 
> This is a WIP and the documentation in this file does not necessarily represent the final implementation

Framework agnostic query client that uses `@tanstack/query-core` and `docucache` to provide resource caching, fine-grained resource subscriptions, and optimistic rendering from arbitrary (but usually fetch request) actions.

This library takes inspiration from apollo client, tanstack query, firebase/firestore, and normy.

## Usage

Similar to tanstack-query, documents are fetched through queries and updated through mutations. Both queries and mutations can return a set of optimistic data to render to the UI while the actual async functionality is happening, thereby presenting a nice interface to the user.

Creating queries and mutations is as simple as wrapping any existing async functions that return data with the `query` or `mutation` functions.
This will then 

```ts
import {createClient} from '@docucache/docuquery';

const client = createClient({
  policies: {},
});

client.policy(type, {});

// Simple list items operation
const listPets = client.operation({
  async operationFn() {
    const response = await fetch('/api/v2/pets');
    return response.json();
  },
  operationKey: ['listPets'],
});

// simple add item mutation operation
const addPet = client.mutation({
  async operationFn(doc: Pet) {
    const response = await fetch('/api/v2/pets', {method: 'post', body: JSON.stringify(doc)});
    return response.json();
  },
  // can also be a string or array if you want the values to be static
  operationKey(doc: Pet) {
    return [ 'addPet', doc.uuid ]
  },
  // Return an array of updates that can be applied to the store.
  // These changes may be rolled back or further updated if an error occurs
  getOptimisticDocuments(doc: Pet) {
    return [ /* */ ];
  },
  // Invalidate documents, other operations, etc.
  invalidations: [['op:listPets']],
});

console.log(await listPets()); // []
await addPet({type: 'Pet', name: 'Fido', breed: 'dog', id: '12345'});
console.log(await listPets()); // [{type: 'Pet', name: 'Fido', breed: 'dog', id: '12345'}]
```

Queries and mutations are themselves also documents and can also be manipulated. This paradigm is enough to implement local-first or entirely offline functionality.

Similar to firestore, in docuquery you _subscribe_ to Document references. The subscription's callback will be called with a snapshot of the document.

```js
import {doc, op} from '@docucache/docuquery';
// subscribe to an operation
const unsubscribe = client.subscribe(op('listPets'), ({data, context}) => {
  console.log(data, context); // [{name: 'Fido', ...}], {isLoading: true, ...}
});
// or subscribe directly to the document itself
const unsubscribe = client.subscribe(doc('Pet:12345'), (snapshot) => {
  console.log(snapshot); // [{name: 'Fido', ...}]
});
// Or you can get the underlying event emitter if you prefer (better for some systems)
import {subscription} from '@docucache/docuquery';
const emitter = client.subscription(op('listPets'));
emitter
  .on('snapshot', ({data, context}) => {});
```

The document reference can be a reference string, a Document, or any object/array with references within it.  

This means you can subscribe to multiple resources by passing in an array. In which case the snapshot will be an array of Documents

```js
client.subscribe([ref1, ref2, ref3], (snapshot) => {
  console.log(snapshot); // Document[]
});
```

Or you can construct a document made of other documents on the fly and subscribe to it

```ts
const profile = {
  name: 'Teddy',
  pets: [ref('Cats:1'), ref('Dogs:2')],
  favorite: ref('pets:1')
}

client.subscribe(profile, (snapshot) => {
  console.log(profile); // {name: 'Teddy', pets: [...], favorite: {...}}
});
```

## Usage within frameworks

Unlike react-query, your query and mutation functions (ie operations) don't need to be defined within the context of hooks, or any framework specific state management system for that matter. 

The `subscribe`/`subscription` functions should be sufficient enough to implement fine-grained document-based reactivity. Subscriptions are themselves very lightweight

### Marko

For subscriptions you might use a component like this:
```marko
<!-- subscription.marko -->
<get/client='client-provider' />
<let/d = null />
<let/c = {} />

<effect() {
  // This returns an unsubscribe function to the effect will be called if `input.ref` changes or the component is unmounted
  return client()
    .subscribe(input.ref, ({data, context}) => {
      d = data;
      c = context;
    });
}/>
<return=[d, c] />
```

When creating operations you might choose to create a decorator so that existing functions can be extended without changing them very much

```marko

class MyComponent {

  @query({
    operationKey: ['listPets']
  })
  listPets() {
    const response = await fetch('/api/v2/pets');
    return response.json();
  }

  onMount() {
    // operationKey must not be a function in order to use it as a subscription key
    this.subscribeTo(subscription(this.listPets))
      .on('snapshot', () => {
        // Do something with the snapshot
      });
  }
}

<subscription|pets|=op(this.listPets)>
  <ol>
    <for|pet| of=pets>
      <li> ${pet.name} </li>
    </for>
  </ol>
</subscription>

<button on-click('listPets')> Refresh </button>
```