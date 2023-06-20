// Based on https://github.com/logicalparadox/filtr/

type Primitive = string | number | boolean | null | undefined;

const comparitors = {
  $eq: (expected: any, actual: any) => expected === actual,
  $neq: (expected: any, actual: any) => expected !== actual,
  $gt: (expected: number, actual: number) => actual > expected,
  $gte: (expected: number, actual: number) => actual >= expected,
  $lt: (expected: number, actual: number) => actual < expected,
  $lte: (expected: number, actual: number) => actual <= expected,
  $in: (expected: any[], actual: any) => expected.includes(actual),
  $nin: (expected: any[], actual: any) => !expected.includes(actual),
  $like: (expected: string, actual: string) => actual.includes(expected),
  $contains: (expected: string, actual: string) => actual.includes(expected),
  $startsWith: (expected: string, actual: string) => actual.startsWith(expected),
  $endsWith: (expected: string, actual: string) => actual.endsWith(expected),
  $between: (expected: [number, number], actual: number) => actual >= expected[0] && actual <= expected[1],
  $exists: (expected: boolean, actual: any) => expected === (actual !== undefined),
  $matches: (expected: RegExp, actual: string) => expected.test(actual),
};

const traversals = {
  $and: (...results: boolean[]) => results.every(result => !!result),
  $or: (...results: boolean[]) => results.some(result => !!result),
}

export type PrimitiveFilter<T> = {[key in keyof Pick<typeof comparitors, '$eq' | '$neq'>]?: T} & {'$exists'?: boolean, '$in'?: T[], '$nin'?: T[]} &
(
  T extends number ? {[key in keyof Pick<typeof comparitors, '$eq' | '$neq' | '$gt' | '$gte' | '$lt' | '$lte' | '$between'>]?: number} :
  T extends string ? ({[key in keyof Pick<typeof comparitors, '$eq' | '$neq' | '$like' | '$contains' | '$startsWith' | '$endsWith'>]?: string} & {'$matches'?: RegExp}) :
  T extends boolean ? {[key in keyof Pick<typeof comparitors, '$eq' | '$neq'>]?: boolean} :
  // Unknown type - allow all comparitors
  {[key in keyof Omit<typeof comparitors, '$eq' | '$neq' | '$exists'>]?: T}
);

export type Filter<TObj> =
  TObj extends Primitive 
    ? TObj | PrimitiveFilter<TObj>
    : { 
      [P in keyof TObj]?: Filter<TObj[P]>
    };


export function test<T>(obj: T, filter: Filter<T>): boolean {
  if(typeof filter !== 'object' || filter === null) {
    return comparitors.$eq(obj, filter);
  }
  return Object.entries(filter).every(([key, value]) => {
    if(typeof value === 'object') {
      return test(obj[key], value as Filter<typeof value>);
    }
    if(key in comparitors) {
      const comparitor = comparitors[key as keyof typeof comparitors];
      return comparitor(value, obj);
    } 
    return comparitors.$eq(obj[key], value);
  });
}

type Schema = {
  // likes: number,
  // comments: number,
  author: {
    name: string,
    followers: number,
  }
}

type FilterSchema = Filter<Schema>;
  // ^?

const filter: FilterSchema = {
  author: {
    name: 'bob',
    followers: {$gt: 10},
  }
}