import {test, expect, describe, setSystemTime} from 'bun:test';
import {setTimeout} from 'bun:timers';
import {sleep} from 'bun';
import {DocuClient} from '../src';

const counter = new Map();

const fastForward = (ms: number) => setSystemTime(new Date(Date.now() + ms));

async function getPerson({id}) {
  counter.set(getPerson, (counter.get(getPerson) || 0) + 1);
  return new Promise((res) => {
    setTimeout(() => {
      res({
        __typename: 'Person',
        _id: id,
        name: 'Bob',
        age: '49',
      });
    }, 1000);
  });
}

const getMutateFn = (responseTime = 1000) => async function({id, age}) {
  return new Promise((res) => {
    setTimeout(() => {
      res({
        __typename: 'Person',
        _id: id,
        name: 'Bob',
        age,
      });
    }, responseTime);
  });
}

describe('query', () => {
  let client: DocuClient;
  let staleTime = 1000;
  let query = {
    queryKey: 'Person:123',
    queryFn: getPerson,
    variables: {id: '123'},
  };

  test('can create client', () => {
    client = new DocuClient({staleTime});
    expect(client).toBeTruthy();
  });

  test('can fetch data', async () => {
    const data = await client.query(query);
    expect(data?.name).toBe('Bob');
    expect(counter.get(getPerson)).toBe(1);
  });

  test('can fetch data from cache', async () => {
    const data = await client.query(query);
    expect(data?.name).toBe('Bob');
    expect(counter.get(getPerson)).toBe(1);
  });

  test('refetch after staletime', async () => {
    fastForward(staleTime);
    const data = await client.query(query);
    expect(data?.name).toBe('Bob');
    expect(counter.get(getPerson)).toBe(2);
  });
});

describe('mutate', () => {
  let staleTime = 5000;
  const client = new DocuClient({staleTime});
  const query = {
    queryKey: 'Person:123',
    queryFn: getPerson,
    variables: {id: '123'},
  };
  const setPersonAge = getMutateFn(1000);
  const mutateFn = () => setPersonAge({id: '123', age: '50'});

  test('get current age', async () => {
    const data = await client.query(query);
    expect(data?.age).toBe('49');
  });

  test('mutate age to 50', async () => {
    const data = await client.mutate({mutateFn});
    expect(data?.age).toBe('50');
  });
});

describe('subscriptions', () => {
  let staleTime = 1000;
  const client = new DocuClient({staleTime});
  let query = {
    queryKey: 'Person:123',
    queryFn: getPerson,
    variables: {id: '123'},
  };
  const setPersonAge = getMutateFn(3000);
  const mutateFn = () => setPersonAge({id: '123', age: '50'});
  let unsubscribe;

  test('get fetching and success statuses', async (done) => {
    const states = [];
    let messageCount = 0;
    unsubscribe = client.subscribe(query, (state) => {
      messageCount++;
      states.push(state);
      expect(state).toBeTruthy();
      if(messageCount === 3) {
        expect(states.map(s => s.status)).toEqual(['idle', 'fetching', 'success']);
        unsubscribe();
        done();
      }
    });
  });

  test('subscribers will get notified before mutation response', async () => {
    let publishTimestamp;
    let responseTimestamp;
    unsubscribe = client.subscribe(query, () => {
      publishTimestamp = performance.now();
    });

    const data = await client.mutate({
      mutateFn,
      onMutate: () => {
        const currentData = client.getCache().get(query.queryKey);
        console.log('onMutate', performance.now());
        client.setQueryData(query.queryKey, {
          ...currentData,
          age: '50',
        })
      },
    });
    responseTimestamp = performance.now();
    expect(data.age).toBe('50');
    expect(publishTimestamp).toBeLessThan(responseTimestamp);
  })
});