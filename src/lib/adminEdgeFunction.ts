import { supabase } from './supabase';

/** Calls `admin-supplier-verification` with the current session JWT. */
export async function invokeAdminEdgeFunction<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.functions.invoke('admin-supplier-verification', { body });

  if (error) {
    const bodyError =
      data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;
    throw new Error(bodyError || error.message || 'Request failed');
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
