import {describe, it, expect, mock} from 'bun:test';
import {Docucache} from '../src';

describe('Policies', () => {
  it('should use default cacheId getter', () => {
    const cache = new Docucache();
    const user = {_id: 'User:123', name: 'John'};
    const documents = cache.extract(user);
    expect(documents.length).toBe(1);
    expect(documents[0]._id).toBe('User:123');
  });

  it('should use custom cacheId getter', async () => {
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
    await cache.extractAndAdd(user);
    expect(cache.size()).resolves.toBe(1);
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

  it('extracts refs', () => {
    const cache = new Docucache();

    const user_1 = {
      _id: '1',
      __typename: 'User',
      name: 'Bob',
      friend: '__ref:2',
    };
    const user_2 = {
      _id: '2',
      __typename: 'User',
      name: 'Alice',
      friend: '__ref:1',
    };
    
    const profile = {
      friends: {
        all: [user_1, user_2],
        best: user_1,
      },
      father: user_1,
    }

    const refs = cache.extractRefs(profile);
    expect(refs).toEqual(['User:1', 'User:2']);
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

  it('can extract deeply nested documents', async () => {
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
    
    await cache.extractAndAdd(john);

    expect(cache.resolve('User:1')).resolves.not.toBe(john); // Objects from cache.resolve should be cloned and not the same as input objects.
    expect(cache.resolve('User:1')).resolves.toEqual(john);

    expect(cache.resolve('User:2')).resolves.not.toBe(jane); // Objects from cache.resolve should be cloned and not the same as input objects.
    expect(cache.resolve('User:2')).resolves.toEqual(jane);

    expect(cache.resolve('Handle:1')).resolves.not.toBe(johnHandle); // Objects from cache.resolve should be cloned and not the same as input objects.
    expect(cache.resolve('Handle:1')).resolves.toEqual(johnHandle);

    expect(cache.resolve('Handle:2')).resolves.not.toBe(jackHandle); // Objects from cache.resolve should be cloned and not the same as input objects.
    expect(cache.resolve('Handle:2')).resolves.toEqual(jackHandle);

    expect(cache.resolve('Handle:3')).resolves.not.toBe(janeHandle); // Objects from cache.resolve should be cloned and not the same as input objects.
    expect(cache.resolve('Handle:3')).resolves.toEqual(janeHandle);
  });

  it('should merge objects with the same id', async () => {
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

    await cache.extractAndAdd(john);
    expect(cache.resolve<typeof john>('User:1')).resolves.toMatchObject({name: john.name});
    expect(cache.resolve<typeof john2>('User:1')).resolves.not.toContainKey('aka');

    await cache.extractAndAdd(john2);
    expect(cache.resolve('User:1')).resolves.toEqual(john2);
  });

  it('should cache from a function', async () => {
    const cache = new Docucache();
    const result = await cache.fromResult(() => {
      return {data: [{__typename: 'User', _id: '1', name: 'John'}]};
    }, 'query:getUser:1');
    expect(cache.size()).resolves.toBe(2);
    expect(result).toEqual(await cache.resolve<typeof result>('query:getUser:1'));
  });

  it('should cache from an async function', async () => {
    const cache = new Docucache();
    const result = await cache.fromResult(async () => {
      return {data: [{__typename: 'User', _id: '1', name: 'John'}]};
    }, 'query:getUser:1');
    expect(cache.size()).resolves.toBe(2);
    expect(result).toEqual(await cache.resolve('query:getUser:1'));
  });
});

describe('Modification', () => {
  it('can modify a document', async () => {
    const cache = new Docucache();

    const john = {
      _id: '1',
      __typename: 'User',
      name: 'John',
    };

    await cache.extractAndAdd(john);
    expect(cache.resolve<typeof john>('User:1')).resolves.toMatchObject({name: john.name});

    await cache.update(john, (john) => {
      john.name = 'Johnny';
    });

    expect(cache.resolve<typeof john>('User:1')).resolves.toMatchObject({name: 'Johnny'});
  });

  it('can modify deeply nested documents', async () => {
    const cache = new Docucache();

    const johnHandle = {__typename: 'Handle', _id: '1', value: '@john', type: 'twitter'};
    const john = {
      __typename: 'User',
      _id: '1',
      name: 'John',
      handle: johnHandle,
    };
    await cache.fromResult(() => ({data: {users: [john]}}), 'query:getUsers');
    await cache.update(johnHandle, (handle) => {
      handle.value = '@johnny';
    });
    expect(cache.resolve<typeof johnHandle>('Handle:1')).resolves.toMatchObject({value: '@johnny'});
    await cache.update(john, (john) => {
      john.handle = {__typename: 'Handle', _id: '2', value: 'johnny', type: 'instagram'};
    });
    expect(cache.resolve<typeof johnHandle>('Handle:2')).resolves.toMatchObject({value: 'johnny'});
  });

  it('can remove documents', async () => {
    const cache = new Docucache();
    const john = {
      __typename: 'User',
      _id: '1',
      name: 'John',
    };
    await cache.extractAndAdd(john);
    expect(cache.resolve('User:1')).resolves.toEqual(john);
    await cache.remove(john);
    expect(cache.resolve('User:1')).resolves.toBeNil();
  });
});

describe('Subscription', () => {
  it('can subscribe to simple ref', async () => {
    const cache = new Docucache();
    const subscription = cache.subscription('User:1');
    const callback = mock(() => {});

    subscription.on('create', callback)
      .on('update', callback)
      .on('delete', callback);
    
    const john = {
      __typename: 'User',
      _id: '1',
      name: 'John',
    };

    await cache.extractAndAdd(john);
    cache.flushPendingUpdates();
    await cache.update(john, () => {
      john.name = 'Johnny';
    });
    cache.flushPendingUpdates();
    await cache.remove(john);
    cache.flushPendingUpdates();
    
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('can subscribe to object with refs', async () => {
    const cache = new Docucache();
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
    };
    const profile = {
      user: jack,
    };
    const callback = mock((...args) => {console.log({args})});
    const subscription = cache.subscription(profile)
      .on('create', () => {});
  });
});