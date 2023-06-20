# @docucache/docucache

Cache arbitrarily nested JSON (eg from http responses) as flattened, normalized documents.

Based heavily on https://www.apollographql.com/docs/react/caching/overview/#how-is-data-stored

This library is the core for `@docucache/doculord` and `@docucache/documerge`.

## What is a document?

A document is any js object in which a `type` can be extracted. 
Out of the box docucache supports getting the type from the following fields of an object:

- `__typename`/`_type`
- `_id` when it's formatted like `[type]:[id]`. eg `User:123`

Both of these can be configured by setting `idFields` and `typeFields` when constructing a DocuCache instance.

Additionally a document will have a cacheId generated which is the id that uniquely identifies a document in the cache.
By default the cacheId will look like `[type]:[id]`, but this can be overriden on a per-type basis using CachePolicies.

Examples of documents include:
```js
[
  {
    _type: 'User', // or __typename in order to support Graphql
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
cache.extractAndAdd(availablePets);
```

This will search deeply for documents in the`availablePets` object, denormalize them, and add them to the cache.

Note that in this response there are 3 documents. A dog, the category the dog belongs to, and a tag for dog.

If you happen to know how to reconstruct the cacheId then you can fetch documents individually.

```js
cache.get('Category:0'); // {_type: "Category", _id: 0, name: "dogs"}
cache.get('Tag:0'); // {_type: "Tag", _id: 0, name: "cutie"}
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
cache.extractAndAdd(dog);
cache.get('Category:0'); // {_type: "Category", _id: 0, name: "doggies"}
```

In some cases you may want to cache the result of an entire request instead of _just_ the nested documents.
This can be useful, for example, to intercept requests and return a cached response in the same format the request normally returns.

```js
const tags = {data: [{_type: "Tag", _id: 0, name: "cutie"}, {_type: "Tag", _id: 1, name: "ugly"}], errors: null, warnings: null};
cache.addAsDocument(obj, 'list-tags');
cache.extractAndAdd({_type: "Tag", _id: 1, name: "hard to love"});
cache.get('list-tags'); // {data: [{_type: "Tag", _id: 0, name: "cutie"}, {_type: "Tag", _id: 1, name: "hard to love"}], errors: null, warnings: null};
```

## Removing documents

Removing a document from the cache doesn't necessarily remove it from all the other documents that reference it.

In some cases this is desirable behavior.

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

## Considerations

When adding documents to the cache it's preferable to always pass in the full shape of the document. 
Fields that are intended to be empty should explicitly be set to `null` or return an empty object, string, or array.

Additionally, changing the shape of documents between requests may result in undefined behavior.