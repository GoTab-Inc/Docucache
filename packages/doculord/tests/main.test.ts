import {describe, it, expect} from 'bun:test';
import * as z from 'zod';
import {Document} from '../src';

describe('basic tests', () => {
  it('works with primitives', () => {
    const Post = Document();
  });
});

describe('schemas', () => {
  // check ide for red squiggles
  const User = Document<{hello: string | number}>();
  const user = User({hello: 'world'});
  User.action('sayHello')
    .when({hello: {$eq: 10}})
    .apply((doc) => {
      doc;
    });
});