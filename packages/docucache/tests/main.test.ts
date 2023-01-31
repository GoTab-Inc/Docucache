import {describe, it, assert} from 'vitest';
import {Docucache} from '../src';

describe.concurrent('Policies', () => {
  it('should use default cacheId getter', () => {
    const cache = new Docucache();
    const user = {_id: 'User:123', name: 'John'};
    const documents = cache.extract(user);
    assert(documents.length === 1);
    assert(documents[0]._id === 'User:123');
  });

  it('should use custom cacheId getter', () => {
    const cache = new Docucache({
      policies: {
        User: {
          getCacheId: (document: any) => {
            return `User:${document.name}`;
          }
        }
      }
    });
    const user = {_id: 'User:123', name: 'John'};
    cache.extractAndAdd(user);
    assert(cache.size === 1);
    assert(cache.resolveId(user) === 'User:John');
  });
});


describe.concurrent('Extraction', () => {
  it('does not throw on primitives', () => {
    const cache = new Docucache();

    const values = [1, 'hello', true, null, undefined, NaN, Infinity, {}, []];

    for (const value of values) {
      const documents = cache.extract(value);
      assert.deepEqual(documents, []);
    }
  });

  it('can extract simple documents', () => {
    const cache = new Docucache();

    const document = {
      _id: '1',
      __typename: 'User',
      name: 'Bob',
    };

    const documents = cache.extract(document);

    assert(documents.length === 1);

    assert.deepEqual(documents, [document]);
  });

  it('can extract deeply nested documents', () => {
    const cache = new Docucache();
    const johnHandle = {__typename: 'Handle', _id: '1', value: '@john', type: 'twitter'};
    const jackHandle = {__typename: 'Handle', _id: '2', value: '@john', type: 'instagram'};
    const janeHandle = {__typename: 'Handle', _id: '3', value: 'jane@email.com', type: 'email'};
    const jane = {__typename: 'User', _id: '2', name: 'Jane', handle: janeHandle};
    const jack = {__typename: 'User', _id: '3', name: 'Jack', handle: jackHandle};

    const john = {
      __typename: 'User', 
      _id: '1', 
      name: 'John',
      nickname: 'Johnny',
      friends: [jane, jack],
      handle: johnHandle,
    };
    
    cache.extractAndAdd(john);

    assert.notEqual(cache.get('User:1'), john, 'Objects from cache.get should not be the same as input objects.');
    assert.deepEqual(cache.get('User:1'), john);

    assert.notEqual(cache.get('User:2'), jane, 'Objects from cache.get should not be the same as input objects.');
    assert.deepEqual(cache.get('User:2'), jane);

    assert.notEqual(cache.get('Handle:1'), johnHandle, 'Objects from cache.get should not be the same as input objects.');
    assert.deepEqual(cache.get('Handle:1'), johnHandle);

    assert.notEqual(cache.get('Handle:2'), jackHandle, 'Objects from cache.get should not be the same as input objects.');
    assert.deepEqual(cache.get('Handle:2'), jackHandle);

    assert.notEqual(cache.get('Handle:3'), janeHandle, 'Objects from cache.get should not be the same as input objects.');
    assert.deepEqual(cache.get('Handle:3'), janeHandle);
  });

  it('should merge objects with the same id', () => {
    const cache = new Docucache();

    const john = {
      _id: '1',
      __typename: 'User',
      name: 'John',
    };

    const john2 = {
      _id: '1',
      __typename: 'User',
      name: 'Johnny',
      aka: 'John',
    };

    cache.extractAndAdd(john);
    assert.equal(cache.get<typeof john>('User:1').name, john.name);
    assert.notExists(cache.get<typeof john2>('User:1').aka);

    cache.extractAndAdd(john2);
    assert.deepEqual(cache.get('User:1'), john2);
  });

  it('should cache from a function', () => {
    const cache = new Docucache();
    const result = cache.fromResult(() => {
      return {data: [{__typename: 'User', _id: '1', name: 'John'}]};
    }, 'query:getUser:1');
    assert.equal(cache.size, 2);
    assert.deepEqual(result, cache.get('query:getUser:1'));
  });

  it('should cache from an async function', async () => {
    const cache = new Docucache();
    const result = await cache.fromResult(async () => {
      return {data: [{__typename: 'User', _id: '1', name: 'John'}]};
    }, 'query:getUser:1');
    assert(cache.size === 2);
    assert.deepEqual(result, cache.get('query:getUser:1'));
  });
});

describe.concurrent('Modification', () => {
  it('can modify a document', () => {
    const cache = new Docucache();

    const john = {
      _id: '1',
      __typename: 'User',
      name: 'John',
    };

    cache.extractAndAdd(john);
    assert.equal(cache.get<typeof john>('User:1').name, john.name);

    cache.update(john, (john) => {
      john.name = 'Johnny';
    });
    assert.equal(cache.get<typeof john>('User:1').name, 'Johnny');
  });

  it('can modify deeply nested documents', () => {
    const cache = new Docucache();

    const johnHandle = {__typename: 'Handle', _id: '1', value: '@john', type: 'twitter'};
    const john = {
      __typename: 'User',
      _id: '1',
      name: 'John',
      handle: johnHandle,
    };
    cache.fromResult(() => ({data: {users: [john]}}), 'query:getUsers');
    cache.update(johnHandle, (handle) => {
      handle.value = '@johnny';
    });
    assert.equal(cache.get<typeof johnHandle>('Handle:1').value, '@johnny');
    cache.update(john, (john) => {
      john.handle = {__typename: 'Handle', _id: '2', value: 'johnny', type: 'instagram'};
    });
    assert.equal(cache.get<typeof johnHandle>('Handle:2').value, 'johnny');
  });

  // Removing a document referenced by another document may orphan the document
  // Say you have a document such as: {_id: 'User:1', friends: ['__ref:User:2', '__ref:User:3']} and then removed `__ref:User:3` from the cache.
  // This reference can no longer be resolved, so what should happen?
  it('can delete a document referenced by another document', () => {});
});