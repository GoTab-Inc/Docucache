import {describe, it, mock} from 'bun:test';
import {createClient} from '../';

describe('basic', () => {
  it('works', async () => {
    const petStore = [
      {
        name: 'Biscuit',
        breed: 'Cat',
      },
      {
        name: 'Hamtaro',
        breed: 'Hamster',
      }
    ];
    const client = createClient({});
    const addPet = client.operation({
      operationKey(args) {
        console.log(args);
        return [];
      },
      operationFn(...args) {
        console.log(args);
        return null;
      },
    });
    const listPets = client.operation({
      operationKey: ['listPets'],
      operationFn() {
        return petStore;
      },
    });
    const pets = await listPets();
    console.log(pets);
    await addPet({name: 'Fluffy', breed: 'Dog'});
    // This will be called when the listPets query is updated
    client.subscribe('op:listPets', (snapshot) => {
      console.log(snapshot);
    });
  });
});