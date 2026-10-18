import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** A stalled browser request must not leave checkout on “Checking…” forever. */
const SUPABASE_FETCH_TIMEOUT_MS = 45_000;

/**
 * supabase-js asks for the auth lock with no timeout (`-1`). Another partner tab
 * that still holds that lock leaves `getSession()` pending, so the partner shell
 * stays on the skeleton. Wait briefly, then continue without the lock.
 */
export const SUPABASE_AUTH_LOCK_MS = 3_000;

function isIllegalLockInvocation(err: unknown): boolean {
  return err instanceof TypeError && /illegal invocation/i.test(err.message);
}

export async function supabaseAuthLock<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  // Call request as a method. Detaching it (`const request = locks.request`) throws
  // "Illegal invocation" and leaves password reset stuck on “Verifying”.
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) return fn();

  const abort = new AbortController();
  let acquired = false;
  const timer = setTimeout(() => {
    if (!acquired) abort.abort();
  }, SUPABASE_AUTH_LOCK_MS);

  try {
    return await locks.request(name, { mode: 'exclusive', signal: abort.signal }, async () => {
      acquired = true;
      clearTimeout(timer);
      return fn();
    });
  } catch (err) {
    if (abort.signal.aborted || isIllegalLockInvocation(err)) return fn();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  const parent = init?.signal;
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', () => controller.abort(), { once: true });
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        global: { fetch: fetchWithTimeout },
        auth: { lock: supabaseAuthLock },
      })
    : null;

export const isSupabaseConfigured = (): boolean => !!supabase;
