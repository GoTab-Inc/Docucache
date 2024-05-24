import {describe, expect, it, mock} from 'bun:test';
import {sleep} from 'bun';
import {createClient} from '../';

const tabStore = [
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

const listTabsByIds = (filter?: string[]) => {
  return tabStore.filter(tab => !filter || filter.includes(tab.id));
}

// describe('operations', () => {
//   const client = createClient();
//   const listTabs = client.operation({
//     operationKey: (ids) => ['listTabs', ...ids || []],
//     async operationFn(ids?: string[]) {
//       await sleep(1000);
//       return listTabsByIds(ids);
//     },
//   });

//   it('will return basic query', async () => {
//     const tabs = await listTabs();
//     expect(tabs.length).toBe(tabStore.length);
//   });

//   it('will return filtered query', async () => {
//     const tabs = await listTabs(['2']);
//     expect(tabs.length).toBe(1);
//   });
// });

describe('subscriptions', () => {
  it('can manually invalidate a subscribed query', async () => {
    const client = createClient();
    const listTabsMock = mock(async (ids?: string[]) => {
      console.log(`ListTabByIds Called with ids: ${ids}`);
      await sleep(1000);
      return listTabsByIds(ids);
    })
    const listTabs = client.operation({
      operationName: 'listTabs',
      // NOTE (and probably a likely source of confusion): The ids here should not be spread into the array
      // This will create a queryKey of, for example, ['op', 'listTabs', '1', '2'] instead of ['op', 'listTabs', ['1', '2']]
      // This means an invalidation key of ['1'] would match ['1', '2'] and ['1', '3'], for example, when you might expect it to only match ['1']   
      operationKey: (ids) => [...ids || []],
      operationFn: listTabsMock,
    });
    // This first call to listTabs will cache the query and queryFn under ['op', 'listTabs', '1']
    await listTabs(['1']);
    expect(listTabsMock).toHaveBeenCalledTimes(1);

    // Now we subscribe to this query
    const unsub = listTabs.subscribe({queryKey: ['1']});
    
    // This invalidation will cause the query to be refetched
    console.log('Invalidating: [\'1\']');
    await listTabs.invalidate({queryKey: ['1']});
    expect(listTabsMock).toHaveBeenCalledTimes(2);
    
    // This should do nothing because listTabs has no query with this queryKey
    console.log('Invalidating: [\'2\']');
    await listTabs.invalidate({queryKey: ['2']});
    expect(listTabsMock).toHaveBeenCalledTimes(2);
    
    // Here we unsubscribe from the query
    unsub();

    // This should now do nothing because the subscription was removed
    console.log('Invalidating: [\'1\']');
    await listTabs.invalidate({queryKey: ['1']});
    expect(listTabsMock).toHaveBeenCalledTimes(2);
  });

  // TODO: Test invalidating by non-exact queryKey
});