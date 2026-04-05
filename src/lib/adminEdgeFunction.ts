import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

async function parseFunctionsHttpError(error: unknown): Promise<string | null> {
  const ctx =
    error &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context: unknown }).context instanceof Response
      ? ((error as { context: Response }).context)
      : null;
  if (!ctx) return null;
  const clone = ctx.clone();
  try {
    const ct = clone.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const j = (await clone.json()) as { error?: string; message?: string };
      if (typeof j?.error === 'string') return j.error;
      if (typeof j?.message === 'string') return j.message;
    } else {
      const text = (await clone.text()).trim();
      if (text) return text.slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  return `HTTP ${ctx.status} from Edge Function`;
}

/** Calls `admin-supplier-verification` with the current session JWT. */
export async function invokeAdminEdgeFunction<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Not signed in. Sign out and sign in again, then retry.');
  }

  const { data, error } = await supabase.functions.invoke<T>('admin-supplier-verification', {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    const fromHttp =
      error instanceof FunctionsHttpError || (error as Error)?.name === 'FunctionsHttpError'
        ? await parseFunctionsHttpError(error)
        : null;
    const bodyError =
      data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;
    throw new Error(fromHttp || bodyError || (error as Error).message || 'Request failed');
  }

  if (data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }

  return data as T;
}

export type AdminStatsPayload = {
  total_suppliers: number;
  pending_business_submissions: number;
  pending_payout_submissions: number;
  total_listings: number;
  published_listings: number;
  registered_customers: number;
};
