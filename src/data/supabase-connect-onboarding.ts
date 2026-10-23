import { supabase } from '../lib/supabase';
import { invalidateSupplierProfileCache } from './supabase-supplier-profile';

export type ConnectOnboardingAction =
  | 'start'
  | 'refresh'
  | 'status'
  | 'account_session'
  | 'account_link';

export type ConnectEmbeddedComponent = 'account_onboarding' | 'account_management';

export type ConnectOnboardingResult = {
  success: boolean;
  error?: string;
  action?: string;
  mode?: 'embedded' | 'hosted' | 'hosted_fallback';
  environment?: string;
  can_receive_transfers?: boolean;
  account_id?: string | null;
  url?: string;
  client_secret?: string;
  publishable_key?: string | null;
  component?: ConnectEmbeddedComponent;
  expires_at?: number;
  onboarding?: Record<string, unknown>;
  payout_schedule?: string;
  fallback_reason?: string;
  note?: string;
};

export async function invokeConnectSupplierOnboarding(
  action: ConnectOnboardingAction,
  opts?: {
    returnOrigin?: string;
    component?: ConnectEmbeddedComponent;
  }
): Promise<ConnectOnboardingResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke<ConnectOnboardingResult>(
    'connect-supplier-onboarding',
    {
      body: {
        action,
        component: opts?.component,
        returnOrigin:
          opts?.returnOrigin ??
          (typeof window !== 'undefined' ? window.location.origin : undefined),
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

/** Fetch a fresh Account Session client secret for Connect.js (server-side only). */
export async function fetchConnectAccountSessionSecret(
  component: ConnectEmbeddedComponent = 'account_onboarding'
): Promise<{ clientSecret: string; publishableKey: string | null; accountId: string | null; mode?: string; url?: string; error?: string }> {
  const result = await invokeConnectSupplierOnboarding('account_session', { component });
  if (!result.success) {
    return { clientSecret: '', publishableKey: null, accountId: null, error: result.error };
  }
  if (result.mode === 'hosted_fallback' || result.mode === 'hosted') {
    return {
      clientSecret: '',
      publishableKey: result.publishable_key ?? null,
      accountId: result.account_id ?? null,
      mode: result.mode,
      url: result.url,
      error: result.fallback_reason,
    };
  }
  if (!result.client_secret) {
    return { clientSecret: '', publishableKey: null, accountId: null, error: 'Missing client secret' };
  }
  return {
    clientSecret: result.client_secret,
    publishableKey: result.publishable_key ?? null,
    accountId: result.account_id ?? null,
    mode: result.mode ?? 'embedded',
  };
}
