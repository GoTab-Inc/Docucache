import {describe, expect, it, mock} from 'bun:test';
import {sleep} from 'bun';
import {createClient} from '../';

const createDatabase = () => {
  const store = [
    {
      __typename: 'Tab',
      id: '1',
      name: 'Bill\'s Tab',
      total: 400,
      orders: [
        {
          __typename: 'Order',
          id: '1',
          total: 200,
          items: [
            {
              __typename: 'Item',
              id: '1',
              name: 'Pizza',
              price: 100,
              quantity: 2
            },
          ]
        },
        {
          __typename: 'Order',
          id: '2',
          total: 200,
          items: [
            {
              __typename: 'Item',
              id: '2',
              name: 'Burger',
              price: 200,
              quantity: 1
            }
          ]
        }
      ]
    },
    {
      __typename: 'Tab',
      id: '2',
      name: 'Jane\'s Tab',
      total: 100,
      orders: [
        {
          __typename: 'Order',
          id: '3',
          total: 100,
          items: [
            {
              __typename: 'Item',
              id: '3',
              name: 'Fries',
              price: 100,
              quantity: 1
            }
          ]
        }
      ]
    }
  ];
  return {
    store,
    listTabsByIds: mock((ids?: string[]) => {
      return store.filter(tab => !ids || ids.includes(tab.id));
    }),
    createTab: mock(() => {
      const tab = {
        __typename: 'Tab',
        id: String(store.length + 1),
        name: 'New Tab',
        total: 0,
        orders: []
      };
      store.push(tab);
      return tab;
    }),
  }
}

describe('operations', () => {
  const {store: tabStore, listTabsByIds} = createDatabase();
  const client = createClient();
  const listTabs = client.operation({
    operationName: 'listTabs',
    operationKey: (ids = []) => [ids],
    operationFn: listTabsByIds,
  });

  it('will return query data', async () => {
    let tabs = await listTabs();
    expect(tabs.length).toBe(tabStore.length);

    tabs = await listTabs(['2']);
    expect(tabs.length).toBe(1);
  });
});

describe('invalidations', () => {
  it('can watch an operation for invalidations', async () => {
    const db = createDatabase();
    const client = createClient();
    const listTabsMock = mock(async (ids?: string[]) => {
      console.log(`ListTabByIds Called with ids: ${ids}`);
      // await sleep(200);
      return db.listTabsByIds(ids);
    })
    const listTabs = client.operation({
      operationName: 'listTabs',
      operationKey: (ids = []) => [ids],
      operationFn: listTabsMock,
    });
    // This first call to listTabs will cache the query and queryFn under ['op', 'listTabs', '1']
    await listTabs(['1']);
    expect(listTabsMock).toHaveBeenCalledTimes(1);

    // Now we subscribe to this query
    const unsub = listTabs.watchInvalidations({queryKey: [['1']], exact: true});
    
    // This invalidation will cause the query to be refetched
    console.log('Invalidating: [\'1\']');
    await listTabs.invalidate({queryKey: [['1']], exact: true});
    expect(listTabsMock).toHaveBeenCalledTimes(2);
    
    // This should do nothing because listTabs has no query with this queryKey
    console.log('Invalidating: [\'2\']');
    await listTabs.invalidate({queryKey: [['2']], exact: true});
    expect(listTabsMock).toHaveBeenCalledTimes(2);
    
    // Here we unsubscribe from the query
    unsub();

    // This should now do nothing because the subscription was removed
    console.log('Invalidating: [\'1\']');
    await listTabs.invalidate({queryKey: [['1']], exact: true});
    expect(listTabsMock).toHaveBeenCalledTimes(2);
  });

  it('can manually invalidate a query by filters', async () => {
    const db = createDatabase();
    const client = createClient();
    const listTabsMock = mock(async (ids?: string[]) => {
      return db.listTabsByIds(ids);
    })
    const listTabs = client.operation({
      operationName: 'listTabs',
      operationKey: (ids = []) => [ids],
      operationFn: listTabsMock,
    });
    // Create subscribers that will watch for invalidations for queries created from various arguments
    // These subscriptions can be created before or after the first call to the function, which can help avoid dealing with lifecycle-based race conditions when constructing UI flows
    // Note that the callback function is used to simplify the tests, but in a real application you would mostly rely on the 
    const mock1 = mock();
    const sub1 = listTabs.watchInvalidations({queryKey: [['1']]}, mock1);
    const mock2 = mock();
    const sub2 = listTabs.watchInvalidations({queryKey: [['1', '2']]}, mock2);
    // Watches the listTabs function with no filters provided. In this case no filters means an empty array of ids
    const mock3 = mock();
    const sub3 = listTabs.watchInvalidations({queryKey: [[]]}, mock3);
    // Run the function once for each variation we watched above
    await listTabs();
    await listTabs(['1']);
    await listTabs(['1', '2']);

    // Invaldate the exact query with the queryKey [['1']]
    await listTabs.invalidate({queryKey: [['1']]});
    await sleep(0); // we need to wait for the next tick before checking if the mock function was called
    expect(mock1).toHaveBeenCalledTimes(1);
    expect(mock2).toHaveBeenCalledTimes(0);
    expect(mock3).toHaveBeenCalledTimes(0);

    // Invaldate the exact query with the queryKey [['1', '2']]
    await listTabs.invalidate({queryKey: [['1', '2']]});
    await sleep(0);
    expect(mock1).toHaveBeenCalledTimes(1);
    expect(mock2).toHaveBeenCalledTimes(1);
    expect(mock3).toHaveBeenCalledTimes(0);

    // Invalidate the exact query with the queryKey [[]]
    await listTabs.invalidate({queryKey: [[]]});
    await sleep(0);
    expect(mock1).toHaveBeenCalledTimes(1);
    expect(mock2).toHaveBeenCalledTimes(1);
    expect(mock3).toHaveBeenCalledTimes(1);

    // Invalidate any query starting with ['1']
    await listTabs.invalidate({queryKey: [['1']], exact: false});
    await sleep(0);
    expect(mock1).toHaveBeenCalledTimes(2);
    expect(mock2).toHaveBeenCalledTimes(2);
    expect(mock3).toHaveBeenCalledTimes(1);

    // Invalidate all 3 queries (this could also be simply [] instead of [[]] in this case)
    await listTabs.invalidate({queryKey: [[]], exact: false});
    await sleep(0);
    expect(mock1).toHaveBeenCalledTimes(3);
    expect(mock2).toHaveBeenCalledTimes(3);
    expect(mock3).toHaveBeenCalledTimes(2);

    // Unsubscribe from the queries
    sub1();
    sub2();
    sub3();
  });

  it('can invalidate a query after another query', async () => {
    const db = createDatabase();
    const client = createClient();
    const listTabsMock = mock(async (ids?: string[]) => {
      return db.listTabsByIds(ids);
    });
    const listTabs = client.operation({
      operationName: 'listTabs',
      operationKey: (ids = []) => [ids],
      operationFn: listTabsMock,
    });
    const createTab = client.operation({
      operationName: 'createTab',
      // Might add an operationKey field here to automatically prefix with 'op', or maybe allow passing in the operation function itself
      invalidate: {queryKey: ['op', 'listTabs', []], exact: false},
      async operationFn() {
        return db.createTab();
      }
    });

    let tabs = await listTabs();
    expect(tabs.length).toBe(2);
    expect(listTabsMock).toHaveBeenCalledTimes(1);
    
    // Calling createTab will invalidate all listTabs queries
    await createTab();
    tabs = await listTabs();
    expect(tabs.length).toBe(3);
    await sleep(0); // we need to wait for the next tick before checking if the mock function was called
    expect(listTabsMock).toHaveBeenCalledTimes(2);
  });
});

// This section is WIP
// Currently subscribing by filters is not supported and the key needs to be exact but we can improve this by implementing a better susbcription system in docustore
// However, using the exact query is the most likely scenario so this feature isn't a huge priority
describe('subscriptions', async () => {
  it('can subscribe to a query', async () => {
    const {listTabsByIds} = createDatabase();
    const client = createClient();
    const listTabs = client.operation({
      operationName: 'listTabs',
      operationKey: (ids = []) => [ids],
      operationFn: listTabsByIds,
    });
    const mocked = mock();
    const unsub = listTabs.subscribe({queryKey: [[]]}, mocked);
    await listTabs();
    await sleep(0); // wait until the next tick just in case
    // The subscription callback can be called multiple times as whenever the state of the query changes, the callback is run.
    expect(mocked).toHaveBeenCalledTimes(1);
    
    unsub();
  });
  it('can receive updates when a nested document is updated', async () => {
    const {listTabsByIds} = createDatabase();
    const client = createClient();
    const listTabs = client.operation({
      operationName: 'listTabs',
      operationKey: (ids = []) => [ids],
      operationFn: listTabsByIds,
    });
    const mocked = mock();
    const unsub = listTabs.subscribe({queryKey: [[]]}, mocked);
    await listTabs();
    await sleep(0); // wait until the next tick just in case
    // The subscription callback will be called multiple times as whenever the state of the query changes, the callback is run.
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(listTabsByIds).toHaveBeenCalledTimes(1);
    // Update a document that was returned by the query and is therefor one of the operation's responsibilities (no re-fetching involved)
    // This should also trigger the subscription callback
    client.store.update('Tab:1', (obj) => ({...obj, name: 'Bob\'s Tab'}));
    // (Not implemented yet)
    // expect(mocked).toHaveBeenCalledTimes(2);
    // This SHOULD NOT re-fetch the query
    // expect(listTabsByIds).toHaveBeenCalledTimes(1);

    unsub();
  });
});