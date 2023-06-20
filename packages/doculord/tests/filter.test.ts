import {describe, it, expect} from 'bun:test';
import {test} from '../src/query';

describe('basic tests', () => {
  it('works with primitives', () => {
    expect(test('bob', {$eq: 'bob'})).toBeTrue();
    expect(test(100, {$eq: 100})).toBeTrue();
    expect(test(true, {$eq: true})).toBeTrue();
    // Short forms
    expect(test(false, false)).toBeTrue();
    expect(test('bob', 'bob')).toBeTrue();
    expect(test(100, 100)).toBeTrue();
  });
  it.only('works with objects', () => {
    const bob = {name: 'bob', age: 10};
    expect(test(bob, {name: {$eq: 'bob'}})).toBeTrue();
    expect(test(bob, {name: 'bob', age: {$lt: 99}})).toBeTrue();
  });
});