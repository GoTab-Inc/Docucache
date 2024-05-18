# @docucache/docucache

Cache arbitrarily nested JSON (eg from http responses) as flattened, normalized documents.

Based heavily on https://www.apollographql.com/docs/react/caching/overview/#how-is-data-stored

This library is the core for `@docucache/doculord` and `@docucache/documerge`.

## What is a document?

A document is any js object in which a `cacheId` can be extracted. 
The `cacheId` uniquely identifies a document in the cache and is usually constructed by concatenating a `type` with an `id`, but can be configured to be extracted in other ways as long as the id is universally unique.

Out of the box docucache supports getting the type from the following fields of an object:

- `__typename`/`_type`
- `_id` when it's formatted like `[type]:[id]`. eg `User:123`

This can be configured by setting `idFields` and `typeFields` when constructing a DocuCache instance.

By default the `cacheId` will look like `[type]:[id]`, but this can be overriden on a per-type basis using CachePolicies.

Examples of documents include:
```js
[
  {
    _type: 'User', // can also be __typename in order to support Graphql responses
    _id: '123',
    user_name: 'John',
    age: 123
  },
  {
    _id: 'User:123',
    user_name: 'John',
    age: 123
  }
]
```

## How it works

DocuCache deeply checks the properties of the passed in object for any objects that can be extracted as a document.

All the documents found are converted to references and stored in a cache in a flattened format in a process called normalization.

When a document is requested from the cache all of its references are denormalized and the full object is returned.

Normalizing the documents allows its properties to be updated independantly from its dependants or dependancies, for example, as the result of a
completely different request than the one that initially created the document.

For a better example, let's first let's consider the classic [petstore api](https://petstore.swagger.io/#/).

We can get a list of available pets by making a request to `GET /pet/findByStatus`.

(Here I've modified the response slightly to add a `_type` property in some places)
```js
const availablePets = [
  {
    "_id": 0,
    "_type": "Pet",
    "category": {
      "_id": 0,
      "_type": "Category",
      "name": "dogs"
    },
    "name": "Max",
    "photoUrls": [
      "https://images.dog.ceo/breeds/ridgeback-rhodesian/n02087394_3663.jpg"
    ],
    "tags": [
      {
        "_type": "Tag",
        "_id": 0,
        "name": "cutie"
      }
    ],
    "status": "available"
  }
]
```

We can add the response to the cache like so

```js
const cache = new DocuCache();
await cache.extractAndAdd(availablePets);
```

This will search deeply for documents in the `availablePets` object, normalize them, and add them to the cache.

Note that in this response there are 3 documents. A dog, the category the dog belongs to, and a tag for dog.

If you happen to know how to reconstruct the `cacheId` then you can fetch documents individually.

```js
await cache.resolve('Category:0'); // {_type: "Category", _id: 0, name: "dogs"}
await cache.resolve('Tag:0'); // {_type: "Tag", _id: 0, name: "cutie"}
```

Now lets say later you make a request to `GET /pet/0` and it returns this data:
```js
const dog = {
  "_id": 0,
  "_type": "Pet",
  "category": {
    "_id": 0,
    "_type": "Category",
    "name": "doggies"
  },
  "name": "Max",
  "photoUrls": [
    "https://images.dog.ceo/breeds/ridgeback-rhodesian/n02087394_3663.jpg"
  ],
  "tags": [
    {
      "_type": "Tag",
      "_id": 0,
      "name": "cutie"
    }
  ],
  "status": "available"
}
```

Note that the category name has changed from `dogs` to `doggies`. 
If we `extractAndAdd` again then as you would imagine, the category document is updated.

```js
await cache.extractAndAdd(dog);
await cache.resolve('Category:0'); // {_type: "Category", _id: 0, name: "doggies"}
```

In some cases you may want to cache the result of an entire request instead of _just_ the nested documents.
This can be useful, for example, to intercept requests and return a cached response in the same format the request normally returns.

```js
const tags = {data: [{_type: "Tag", _id: 0, name: "cutie"}, {_type: "Tag", _id: 1, name: "ugly"}], errors: null, warnings: null};
// Cache an arbitrary repsone as its own id
await cache.addAsDocument(obj, 'list-tags');
// Update one of the tags returned
await cache.extractAndAdd({_type: "Tag", _id: 1, name: "hard to love"});
await cache.resolve('list-tags'); // {data: [{_type: "Tag", _id: 0, name: "cutie"}, {_type: "Tag", _id: 1, name: "hard to love"}], errors: null, warnings: null};
```

## Policies

Policies are type-level configurations for Documents in the cache. These policies include extractors, size limitation/purge configurations, as well as resolvers for when data is missing from the store.

## Removing documents

Removing a document usually just means removing the reference to it in any data that references it. When a document is no longer referenced by any other documents it will be garbage collected. This process occurs in the background automatically, but can also be triggered by calling the `clean` function directly.

Documents can also be removed from the cache directly, however, removing documents from the cache doesn't automatically remove them from all the other documents that may reference it.

Imagine a user has a _large_ list of friends.

```js
{
  _id: 'User:John',
  name: 'John',
  friends: [
    {
      _id: 'User:Jack',
      name: 'Jack',
    }
    // ... + 100 more
  ]
}
```

To conserve space in the cache you may choose to only store up to 100 User objects. 
Once the cache reaches 101 friends, you might choose to purge older entries from the cache.

When a document doesn't exist in the cache, you will get an instance of `MissingData` in its place when hydrating a resource.

If you would like to throw an error instead, set `throwOnMissing` in the options when resolving the resource.
Alternatively you may provide an `onMissingResource` callback that will be called with the type and id of the missing resource. This allows you to resolve the resource with a network request. Resolving the resource adds it to the cache and may invoke purging policies as well.

Both of these options can also be specified in the cache policies.

## Observing Documents

Observing a document means adding a subscriber function to a document reference that will be notified when a document is created, destroyed, or updated.

An observability adapter only needs to implement two interfaces.

> [!NOTE] (WIP: Subject to change)

```ts

const BaseAdapter: ObservableAdapter = {
  getSnapshot<T>(doc: any): Promise<any> {
    // ...
  },
  getMutable<T>(doc: any): Promise<any> {
    // ...
  },
  subscribe<T>(doc: any, fn: (doc: any) => void): () => void {
    // ...
  }
}

```

## Considerations

When adding documents to the cache it's preferable to always pass in the full shape of the document. 
Fields that are intended to be empty should explicitly be set to `null` or return an empty object, string, or array.

Additionally, changing the shape of documents between requests may result in `undefined` behavior if your application isn't set up to handle different shapes for documents.