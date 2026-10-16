import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** A stalled browser request must not leave checkout on “Checking…” forever. */
const SUPABASE_FETCH_TIMEOUT_MS = 45_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  const parent = init?.signal;
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener('abort', () => controller.abort(), { once: true });
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase =
  url && anonKey ? createClient(url, anonKey, { global: { fetch: fetchWithTimeout } }) : null;

export const isSupabaseConfigured = (): boolean => !!supabase;
