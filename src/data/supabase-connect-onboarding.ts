import { supabase } from '../lib/supabase';
import { invalidateSupplierProfileCache } from './supabase-supplier-profile';

export type ConnectOnboardingAction =
  | 'start'
  | 'refresh'
  | 'status'
  | 'account_session'
  | 'account_link'
  | 'ensure_account'
  | 'start_native_custom'
  | 'submit_business'
  | 'submit_representative'
  | 'accept_tos'
  | 'attach_bank_token'
  | 'submit_identity_file';

export type ConnectEmbeddedComponent = 'account_onboarding' | 'account_management';

export type ConnectBusinessPayload = {
  legal_name?: string;
  business_type?: 'company' | 'individual';
  tax_id?: string;
  registration_number?: string;
  phone?: string;
  url?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    state?: string;
  };
};

export type ConnectRepresentativePayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  dob?: { day?: number; month?: number; year?: number };
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    state?: string;
  };
  relationship?: {
    owner?: boolean;
    percent_ownership?: number | null;
    executive?: boolean;
    director?: boolean;
  };
};

export type ConnectOnboardingResult = {
  success: boolean;
  error?: string;
  action?: string;
  mode?: 'embedded' | 'hosted' | 'hosted_fallback' | 'api_native';
  environment?: string;
  can_receive_transfers?: boolean;
  account_id?: string | null;
  account_type?: string | null;
  onboarding_mode?: 'api_native' | 'embedded' | 'unknown' | string;
  url?: string;
  client_secret?: string;
  publishable_key?: string | null;
  component?: ConnectEmbeddedComponent;
  expires_at?: number;
  onboarding?: Record<string, unknown>;
  payout_schedule?: string;
  fallback_reason?: string;
  note?: string;
  person_id?: string;
  bank_attached?: boolean;
  native_blocked_reason?: string | null;
  archived_legacy_account_id?: string | null;
};

export async function invokeConnectSupplierOnboarding(
  action: ConnectOnboardingAction,
  opts?: {
    returnOrigin?: string;
    component?: ConnectEmbeddedComponent;
    business?: ConnectBusinessPayload;
    representative?: ConnectRepresentativePayload;
    bank_token?: string;
    tos_accepted?: boolean;
    identity?: { person_id?: string; file_id?: string; side?: 'front' | 'back' };
    confirm_archive_express?: boolean;
  }
): Promise<ConnectOnboardingResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke<ConnectOnboardingResult>(
    'connect-supplier-onboarding',
    {
      body: {
        action,
        component: opts?.component,
        business: opts?.business,
        representative: opts?.representative,
        bank_token: opts?.bank_token,
        tos_accepted: opts?.tos_accepted,
        identity: opts?.identity,
        confirm_archive_express: opts?.confirm_archive_express,
        returnOrigin:
          opts?.returnOrigin ??
          (typeof window !== 'undefined' ? window.location.origin : undefined),
      },
    }
  );
  if (error) return { success: false, error: error.message };
  if (!data?.success) {
    return { success: false, error: data?.error ?? 'Payout verification failed', ...data };
  }
  invalidateSupplierProfileCache();
  return data;
}

/** Fetch a fresh Account Session client secret for Connect.js (Express legacy / remediation). */
export async function fetchConnectAccountSessionSecret(
  component: ConnectEmbeddedComponent = 'account_onboarding'
): Promise<{
  clientSecret: string;
  publishableKey: string | null;
  accountId: string | null;
  mode?: string;
  url?: string;
  error?: string;
}> {
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
