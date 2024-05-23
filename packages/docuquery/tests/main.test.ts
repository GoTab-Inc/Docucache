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

describe('operations', () => {
  const client = createClient();
  const listTabs = client.operation({
    operationKey: (ids) => ['listTabs', ...ids || []],
    async operationFn(ids?: string[]) {
      await sleep(1000);
      return listTabsByIds(ids);
    },
  });

  let unsub: () => void;

  it('will return basic query', async () => {
    const tabs = await listTabs();
    expect(tabs.length).toBe(tabStore.length);
  });

  it('will return filtered query', async () => {
    const tabs = await listTabs(['2']);
    expect(tabs.length).toBe(1);
  });

  it('can be subscribed to', async (done) => {
    unsub = await listTabs.subscribe((result) => {
      const data = result.data;
      expect(data.length).toBe(1);
      done();
    });
  });

  it('changing filter will automatically resub to same cb without needing to manually unsub', async (done) => {
    unsub();
    let cbCount = 0;
    let expectedTabs = [['2'], ['1', '2']]; // First one should only be subscribed to tab 2, and then the second one should be subscribed to all tabs
    const receivedTabs: any[] = [];
    await listTabs(['2']); 
    const callback = mock((result) => {
      cbCount++;
      receivedTabs.push(result.data.map(tab => tab.id));
      if(cbCount === 2) {
        expect(receivedTabs).toStrictEqual(expectedTabs);
        done();
      }
    });
    await listTabs.subscribe(callback);
    await listTabs();
  });
});