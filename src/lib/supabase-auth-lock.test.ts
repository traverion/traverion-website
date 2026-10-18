import { afterEach, describe, expect, it } from 'vitest';
import { SUPABASE_AUTH_LOCK_MS, supabaseAuthLock } from './supabase';

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
  });
});

describe('supabaseAuthLock', () => {
  it('runs immediately when the browser has no lock manager', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    await expect(supabaseAuthLock('lock:sb', -1, async () => 'open')).resolves.toBe('open');
  });

  it('does not wait forever when another tab holds the auth lock', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        locks: {
          request: (_name: string, opts: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts.signal.addEventListener('abort', () => {
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
              });
            }),
        },
      },
      configurable: true,
    });
    const started = Date.now();
    await expect(supabaseAuthLock('lock:sb', -1, async () => 'open')).resolves.toBe('open');
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(SUPABASE_AUTH_LOCK_MS - 50);
    expect(elapsed).toBeLessThan(SUPABASE_AUTH_LOCK_MS + 2_000);
  });

  it('still runs when LockManager.request throws Illegal invocation', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        locks: {
          request() {
            throw new TypeError("Failed to execute 'request' on 'LockManager': Illegal invocation");
          },
        },
      },
      configurable: true,
    });
    await expect(supabaseAuthLock('lock:sb', -1, async () => 'open')).resolves.toBe('open');
  });
});
