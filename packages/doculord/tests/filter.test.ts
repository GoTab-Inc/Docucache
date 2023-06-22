import {describe, it, expect} from 'bun:test';
import {test} from '../src/query';

describe('primitives', () => {
  it('raw', () => {
    expect(test('bob', 'bob')).toBeTrue();
    expect(test('bob', 'joe')).toBeFalse();

    expect(test(100, 100)).toBeTrue();
    expect(test(100, 0)).toBeFalse();

    expect(test(true, true)).toBeTrue();
    expect(test(true, false)).toBeFalse();

    expect(test(false, false)).toBeTrue();
    expect(test(false, true)).toBeFalse();

    expect(test([], [])).toBeTrue();
    expect(test([], [1])).toBeFalse();

    expect(test({}, {})).toBeTrue();
    expect(test({}, {name: 'bob'})).toBeFalse();
    expect(test({name: 'bob'}, {name: 'bob'})).toBeTrue();
    expect(test({name: 'bob'}, {name: 'joe'})).toBeFalse();
    expect(test({name: 'bob'}, {name: 'bob', age: 14})).toBeFalse();

    expect(test({name: 'bob'}, {$eq: {name: 'bob'}})).toBeTrue();
  });
  it('equality', () => {
    // Note that we have to cast types to be more generic or typescript will complain
    expect(test('bob' as string, {$eq: 'bob'})).toBeTrue();
    expect(test(100 as number, {$eq: 100})).toBeTrue();

    expect(test(true as boolean, {$eq: true})).toBeTrue();
    expect(test(true as boolean, {$eq: false})).toBeFalse();
    expect(test(true as boolean, {$neq: false})).toBeTrue();
    expect(test(true as boolean, {$neq: true})).toBeFalse();
    
    expect(test(false as boolean, {$eq: false})).toBeTrue();
    expect(test(false as boolean, {$eq: true})).toBeFalse();
    expect(test(false as boolean, {$neq: true})).toBeTrue();
    expect(test(false as boolean, {$neq: false})).toBeFalse();
  });
  it('inequality', () => {
    expect(test(100 as number, {$lt: 101})).toBeTrue();
    expect(test(100 as number, {$lt: 100})).toBeFalse();
    expect(test(100 as number, {$lte: 100})).toBeTrue();
    expect(test(100 as number, {$lte: 99})).toBeFalse();

    expect(test(100 as number, {$gt: 99})).toBeTrue();
    expect(test(100 as number, {$gt: 100})).toBeFalse();
    expect(test(100 as number, {$gte: 100})).toBeTrue();
    expect(test(100 as number, {$gte: 101})).toBeFalse();
  });
  it('existence', () => {

  });
  it('inclusion', () => {

  });
});

describe('objects', () => {
  it('root', () => {
    const bob = {name: 'bob', age: 10};
    expect(test(bob, {name: {$eq: 'bob'}})).toBeTrue();
    expect(test(bob, {name: 'bob', age: {$lt: 99}})).toBeTrue();
  });
  it('nested', () => {
    const user = {name: 'bob', age: 10, address: {street: '123 fake st', city: 'springfield'}};
    expect(test(user, {address: {street: '123 fake st'}})).toBeTrue();
    expect(test(user, {address: {city: 'Alexandria'}})).toBeFalse();
  })
});

describe('traversals', () => {
  it.only('$and', () => {
    const user = {name: 'bob', age: 10, address: {street: '123 fake st', city: 'springfield'}};
    expect(test(user, {$and: [{name: 'bob'}]})).toBeTrue();
  });
  it('$or', () => {
    const user = {name: 'bob', age: 10, address: {street: '123 fake st', city: 'springfield'}};
    expect(test(user, {$or: [{name: 'bob'}, {name: 'joe'}]})).toBeTrue();
    expect(test(user, {$or: [{name: 'joe'}, {name: 'jim'}]})).toBeFalse();
  });
});