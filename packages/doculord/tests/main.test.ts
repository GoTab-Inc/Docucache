import {describe, it, expect} from 'bun:test';
import * as z from 'zod';
import {Document} from '../src';

describe('basic tests', () => {
  it('works with primitives', () => {
    const Post = Document();
  });
});

describe('schemas', () => {
  it('works with generic schema', () => {
    type UserSchema = {
      name: string,
      age: number
    };
    type PostSchema = {
      title: string
    }
    const PostParser = {parse: (data: Partial<PostSchema>) => data as PostSchema};
    const User = Document<UserSchema>();
    User.action('sayHello')
      .when({age: {$eq: 10}})
      .apply((doc) => {
        doc;
      });
    const Post = Document({schema: PostParser});
    Post.action('updateTitle')
      .when({title: {$eq: 'hello'}})
      .apply((doc) => {
        doc;
      });
  });
  it('works with zod schema', () => {
    const UserSchema = z.object({
      name: z.string(),
      age: z.number()
    });
    const PostSchema = z.object({
      title: z.string(),
    });
    // check ide for red squiggles
    const User = Document<typeof UserSchema>();
    User.action('sayHello')
      .when({age: {$eq: 10}})
      .apply((doc) => {
        doc;
      });
    const Post = Document({schema: PostSchema});
    Post.action('updateTitle')
      .when({title: {$eq: 'hello'}})
      .apply((doc) => {
        doc;
      });
  });
});