/**
 * In-flight request coalescing + short TTL result cache.
 * Cache is process-local (browser tab). Never share across users — key by auth scope.
 */

type Entry<T> = {
  at: number;
  promise: Promise<T>;
};

export function createInflightCache<T>(opts?: { ttlMs?: number }) {
  const ttlMs = opts?.ttlMs ?? 10_000;
  const map = new Map<string, Entry<T>>();

  return {
    get(key: string, factory: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const hit = map.get(key);
      if (hit && now - hit.at < ttlMs) return hit.promise;
      const promise = factory().catch((err) => {
        const cur = map.get(key);
        if (cur?.promise === promise) map.delete(key);
        throw err;
      });
      map.set(key, { at: now, promise });
      return promise;
    },
    invalidate(key?: string) {
      if (key) map.delete(key);
      else map.clear();
    },
    peek(key: string): Promise<T> | null {
      const hit = map.get(key);
      if (!hit) return null;
      if (Date.now() - hit.at >= ttlMs) {
        map.delete(key);
        return null;
      }
      return hit.promise;
    },
  };
}
