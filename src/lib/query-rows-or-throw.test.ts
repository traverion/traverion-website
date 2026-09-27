import { describe, expect, it } from 'vitest';
import { queryRowsOrThrow } from './query-rows-or-throw';

describe('queryRowsOrThrow (Phase 1084)', () => {
  it('returns rows when the query succeeded', () => {
    expect(queryRowsOrThrow([{ id: 'a' }], null)).toEqual([{ id: 'a' }]);
    expect(queryRowsOrThrow(null, null)).toEqual([]);
    expect(queryRowsOrThrow(undefined, null)).toEqual([]);
  });

  it('throws on query error instead of returning []', () => {
    expect(() => queryRowsOrThrow([{ id: 'a' }], { message: 'permission denied' })).toThrow(
      /permission denied/
    );
    expect(() => queryRowsOrThrow([], { message: 'network' })).toThrow(/network/);
  });
});
