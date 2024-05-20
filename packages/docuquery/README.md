# docuquery

> [!NOTE] 
> This is a WIP and the documentation in this file does not necessarily represent the final implementation

Framework agnostic query client that uses `@tanstack/query-core` and `docucache` to provide resource caching, fine-grained resource subscriptions, and optimistic rendering from arbitrary (but usually fetch request) actions.

This library takes inspiration from apollo client, tanstack query, firebase/firestore, and normy.

## Usage

Similar to tanstack-query, documents are fetched through queries and updated through mutations. Both queries and mutations can return a set of optimistic data to render to the UI while the actual async functionality is happening, thereby presenting a nice interface to the user. This process is called an `operation`. 

Creating an operation is as simple as wrapping any existing async functions that return data with the `operation` function from a docuquery client, which shares most arguments with tanstack query with a few differences that enable the fine grained, detached, resource watching.

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

Documents can be updated imperatively and the changes will be reflected in the UI as well as the operations that reference the document, though in general it's better to create a mutation operation that will return these updates

```js
client.update(doc('Pet', '12345'), (pet) => {
  pet.deceased = true;
})
```

Operations are themselves also stored as documents and can also be manipulated outside of the context of an operation. This can be useful when extreme control over the underlying store is needed, but in general it's better to update your documents using operations.

```js
client.update(op('listPets'), ({data, context}) => {
  data.pets.splice(1);
  return data;
});
```

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
    // If you want to access docs and snapshots from within a component or other class use the client directly   
    // NOTE: operationKey must not be a function in order to use it as a subscription key
    client.snapshot(this.listPets).then(snapshot => { /** */ });

    // You can also subscribe to the snapshot if you want the data to stay synced
    this.subscribeTo(subscription(this.listPets))
      .on('snapshot', ({data: pets, context}) => {
        this.state.isLoading = isLoading;
        this.state.pets = pets;
      });
  }
}

<subscription|[pets, {isLoading}]|=op(this.listPets)>
  <ol>
    <for|pet| of=pets>
      <li> ${pet.name} </li>
    </for>
  </ol>
  <button on-click('listPets') disabled=isLoading> Refresh </button>
</subscription>

```