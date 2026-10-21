import { describe, expect, it } from 'vitest';
import { createInflightCache } from './inflight-dedupe';

describe('createInflightCache', () => {
  it('coalesces concurrent factories for the same key', async () => {
    const cache = createInflightCache<number>({ ttlMs: 5_000 });
    let calls = 0;
    const factory = () => {
      calls += 1;
      return Promise.resolve(42);
    };
    const [a, b] = await Promise.all([cache.get('k', factory), cache.get('k', factory)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
  });

  it('invalidates so the next get runs again', async () => {
    const cache = createInflightCache<number>({ ttlMs: 5_000 });
    let calls = 0;
    const factory = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    expect(await cache.get('k', factory)).toBe(1);
    cache.invalidate('k');
    expect(await cache.get('k', factory)).toBe(2);
  });
});
