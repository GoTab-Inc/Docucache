import {describe, it, expect} from 'bun:test';
import {Docucache} from '../src';

describe('Policies', () => {
  it('should use default cacheId getter', () => {
    const cache = new Docucache();
    const user = {_id: 'User:123', name: 'John'};
    const documents = cache.extract(user);
    expect(documents.length).toBe(1);
    expect(documents[0]._id).toBe('User:123');
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
    expect(cache.size).toBe(1);
    expect(cache.resolveId(user)).toBe('User:John');
  });
});


describe('Extraction', () => {
  it('does not throw on primitives', () => {
    const cache = new Docucache();

    const values = [1, 'hello', true, null, undefined, NaN, Infinity, {}, []];

    for (const value of values) {
      const documents = cache.extract(value);
      expect(documents).toEqual([]);
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

    expect(documents.length).toBe(1);
    expect(documents).toEqual([document]);
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

    expect(cache.get('User:1')).not.toBe(john); // Objects from cache.get should be cloned and not the same as input objects.
    expect(cache.get('User:1')).toEqual(john);

    expect(cache.get('User:2')).not.toBe(jane); // Objects from cache.get should be cloned and not the same as input objects.
    expect(cache.get('User:2')).toEqual(jane);

    expect(cache.get('Handle:1')).not.toBe(johnHandle); // Objects from cache.get should be cloned and not the same as input objects.
    expect(cache.get('Handle:1')).toEqual(johnHandle);

    expect(cache.get('Handle:2')).not.toBe(jackHandle); // Objects from cache.get should be cloned and not the same as input objects.
    expect(cache.get('Handle:2')).toEqual(jackHandle);

    expect(cache.get('Handle:3')).not.toBe(janeHandle); // Objects from cache.get should be cloned and not the same as input objects.
    expect(cache.get('Handle:3')).toEqual(janeHandle);
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
    expect(cache.get<typeof john>('User:1').name).toBe(john.name);
    expect(cache.get<typeof john2>('User:1').aka).toBeUndefined();

    cache.extractAndAdd(john2);
    expect(cache.get('User:1')).toEqual(john2);
  });

  it('should cache from a function', () => {
    const cache = new Docucache();
    const result = cache.fromResult(() => {
      return {data: [{__typename: 'User', _id: '1', name: 'John'}]};
    }, 'query:getUser:1');
    expect(cache.size).toBe(2);
    expect(result).toEqual(cache.get('query:getUser:1'));
  });

  it('should cache from an async function', async () => {
    const cache = new Docucache();
    const result = await cache.fromResult(async () => {
      return {data: [{__typename: 'User', _id: '1', name: 'John'}]};
    }, 'query:getUser:1');
    expect(cache.size).toBe(2);
    expect(result).toEqual(cache.get('query:getUser:1'));
  });
});

describe('Modification', () => {
  it('can modify a document', () => {
    const cache = new Docucache();

    const john = {
      _id: '1',
      __typename: 'User',
      name: 'John',
    };

    cache.extractAndAdd(john);
    expect(cache.get<typeof john>('User:1').name).toBe(john.name);

    cache.update(john, (john) => {
      john.name = 'Johnny';
    });

    expect(cache.get<typeof john>('User:1').name).toBe('Johnny');
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
    expect(cache.get<typeof johnHandle>('Handle:1').value).toBe('@johnny');
    cache.update(john, (john) => {
      john.handle = {__typename: 'Handle', _id: '2', value: 'johnny', type: 'instagram'};
    });
    expect(cache.get<typeof johnHandle>('Handle:2').value).toBe('johnny');
  });

  it('can remove documents', () => {
    const cache = new Docucache();
    const john = {
      __typename: 'User',
      _id: '1',
      name: 'John',
    };
    cache.extractAndAdd(john);
    expect(cache.get('User:1')).toEqual(john);
    cache.remove(john);
    expect(cache.get('User:1')).toBeNil();
  });

  // Removing a document referenced by another document may orphan the document
  // Say you have a document such as: {_id: 'User:1', friends: ['__ref:User:2', '__ref:User:3']} and then removed `__ref:User:3` from the cache.
  // 
  it('can delete orphaned documents', () => {
    const cache = new Docucache({autoRemoveOrphans: true});
    const john = {
      __typename: 'User',
      _id: '1',
      name: 'John',
    };
    const jane = {
      __typename: 'User',
      _id: '2',
      name: 'Jane',
      friends: [john],
    };
    const jack = {
      __typename: 'User',
      _id: '3',
      name: 'Jack',
      friends: [john, jane],
      test: ['hello', 1, {name: 'Jill'}]
    };
    cache.extractAndAdd(jack);
    expect(cache.get('User:3')).toEqual(jack);
    // remove john and jane from the cache
    cache.remove(john);
    // get jack again from the cache. Since john and jane are no longer in the cache, they should be removed from jack's friends list.
    // and since jane is no longer refrenced by any other document, she is removed from the cache
    // console.log(cache.get('User:3'));
    expect(cache.get<typeof jack>('User:3').friends).toEqual([
      {
        __typename: 'User',
        _id: '2',
        name: 'Jane',
        friends: [], // john was removed from jane's friends list
      }
    ]);
  });
});