import {describe, it, mock} from 'bun:test';
import {sleep} from 'bun';
import {createClient} from '../';

describe('basic', () => {
  it('works', async () => {
    const petStore = [
      {
        __typename: 'Pet',
        id: '1',
        name: 'Biscuit',
        breed: 'Cat',
      },
      {
        __typename: 'Pet',
        id: '2',
        name: 'Hamtaro',
        breed: 'Hamster',
      }
    ];
    
    const client = createClient();

    const addPet = client.operation({
      operationKey(pet: any) {
        return ['addPet', pet.id];
      },
      async operationFn(pet: any) {
        console.log('Adding pet');
        const id = (petStore.length + 1).toString();
        petStore.push({...pet, __typename: 'Pet', id});
        // Sleep for 1 second to simulate a network request
        await sleep(1000);
        return null;
      },
    });
    const listPets = client.operation({
      operationKey: ['listPets'],
      async operationFn() {
        console.log('Listing pets');
        await sleep(1000);
        return petStore;
      },
    });
    const callback = mock((snapshot) => {
      console.log('Query data updated');
      console.log(snapshot);
    });
    // console.log(pets);
    // This will be called when the listPets query is updated
    client.subscribe(listPets, callback);
    let pets = await listPets();
    // console.log(pets);
    await addPet({name: 'Fluffy', breed: 'Dog'});
    pets = await listPets();
    // callback should be called a few times
  });
});