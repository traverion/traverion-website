import { supabase } from '../lib/supabase';
import { invalidateSupplierProfileCache } from './supabase-supplier-profile';

export type ConnectOnboardingAction = 'start' | 'refresh' | 'status';

export type ConnectOnboardingResult = {
  success: boolean;
  error?: string;
  action?: string;
  environment?: string;
  can_receive_transfers?: boolean;
  account_id?: string | null;
  url?: string;
  expires_at?: number;
  onboarding?: Record<string, unknown>;
  payout_schedule?: string;
  note?: string;
};

export async function invokeConnectSupplierOnboarding(
  action: ConnectOnboardingAction,
  opts?: { returnOrigin?: string }
): Promise<ConnectOnboardingResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke<ConnectOnboardingResult>(
    'connect-supplier-onboarding',
    {
      body: {
        action,
        returnOrigin: opts?.returnOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined),
      },
    }
  );
  if (error) return { success: false, error: error.message };
  if (!data?.success) {
    return { success: false, error: data?.error ?? 'Connect onboarding failed' };
  }
  invalidateSupplierProfileCache();
  return data;
}
