import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

async function parseFunctionsHttpError(error: FunctionsHttpError): Promise<string | null> {
  const res = error.context as Response | undefined;
  if (!res || typeof res.json !== 'function') return null;
  try {
    const j = (await res.clone().json()) as { error?: string };
    return typeof j?.error === 'string' ? j.error : null;
  } catch {
    return null;
  }
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
    const fromHttp = error instanceof FunctionsHttpError ? await parseFunctionsHttpError(error) : null;
    const bodyError =
      data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;
    throw new Error(fromHttp || bodyError || error.message || 'Request failed');
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
