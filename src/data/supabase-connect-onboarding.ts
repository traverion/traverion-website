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
  | 'submit_beneficial_owners'
  | 'accept_tos'
  | 'attach_bank_token'
  | 'submit_identity_file'
  | 'upload_identity_document'
  | 'save_wizard_draft';

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

export type ConnectBeneficialOwnerPayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  dob?: { day?: number; month?: number; year?: number };
  percent_ownership?: number | null;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    state?: string;
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
  person_ids?: string[];
  file_id?: string;
  bank_attached?: boolean;
  native_blocked_reason?: string | null;
  archived_legacy_account_id?: string | null;
  /** LIVE Custom create eligibility (gate + allowlist). TEST always allowed. */
  live_gate_enabled?: boolean;
  supplier_allowlisted?: boolean;
  live_create_allowed?: boolean;
  live_create_blocked_reason?: string | null;
  payout_gates_open?: boolean;
  payout_execution_enabled?: boolean;
  connect_transfers_enabled?: boolean;
  /** Non-sensitive server draft (no IBAN / full DOB). */
  wizard_draft?: Record<string, unknown> | null;
  wizard_draft_updated_at?: string | null;
};

async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'Payout verification failed';
  const ctx =
    error &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context: unknown }).context instanceof Response
      ? (error as { context: Response }).context
      : null;
  if (!ctx) return fallback;
  try {
    const clone = ctx.clone();
    const ct = clone.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = (await clone.json()) as { error?: unknown; message?: unknown };
      if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
      if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
    } else {
      const text = (await clone.text()).trim();
      if (text) return text.slice(0, 400);
    }
  } catch {
    /* ignore parse failures */
  }
  if (ctx.status === 401) return 'Unauthorized';
  if (ctx.status === 403) return 'Forbidden';
  return fallback;
}

/** Partner-facing Connect onboarding errors (not raw Stripe/edge text). */
export function connectOnboardingUserMessage(raw: string | null | undefined): string {
  const msg = (raw ?? '').trim();
  if (!msg) return 'Something went wrong starting payout verification. Try again.';
  if (/unauthorized|session_not_found|invalid jwt|jwt expired|auth session missing/i.test(msg)) {
    return 'Your partner session ended. Sign in again, then choose Continue verification.';
  }
  if (/forbidden|not allowed|role can view/i.test(msg)) {
    return 'Your role can view payout setup but cannot start Stripe verification.';
  }
  if (/failed to send a request to the edge function/i.test(msg)) {
    return 'We could not save that step. Your details are still here — try again.';
  }
  if (/failed to fetch|networkerror|load failed|aborterror|timed?\s*out/i.test(msg)) {
    return 'Could not reach payout verification. Check your connection and try again.';
  }
  if (/account_session|client secret|missing client secret|could not start verification/i.test(msg)) {
    return 'Could not start Stripe verification for this account. Try again in a moment.';
  }
  if (/no connected account|missing connect|account not found/i.test(msg)) {
    return 'No payout account is linked yet. Finish business details, then try verification again.';
  }
  if (/LIVE payout account creation is turned off|Payout connection is not open/i.test(msg)) {
    return 'Payout connection is not open yet. Your details stay saved here.';
  }
  if (/not approved for LIVE|being prepared for your account/i.test(msg)) {
    return 'Payout connection is being prepared for your account. Your details stay saved.';
  }
  if (/business verification must be approved|Finish Traverion business verification/i.test(msg)) {
    return 'Finish business verification first. You can keep saving payout details meanwhile.';
  }
  if (/pilot approval has not been recorded|pilot checklist/i.test(msg)) {
    return 'Payout connection is being prepared for your account. Your details stay saved.';
  }
  if (/already in progress/i.test(msg)) {
    return 'Payout account setup is already in progress. Wait a moment, then continue.';
  }
  if (/responsibilities of collecting requirements|platform-profile|platform profile/i.test(msg)) {
    return 'Payout connection is almost ready. Traverion is finishing Stripe platform setup — try again shortly.';
  }
  return msg;
}

export async function invokeConnectSupplierOnboarding(
  action: ConnectOnboardingAction,
  opts?: {
    returnOrigin?: string;
    component?: ConnectEmbeddedComponent;
    business?: ConnectBusinessPayload;
    representative?: ConnectRepresentativePayload;
    owners?: ConnectBeneficialOwnerPayload[];
    bank_token?: string;
    tos_accepted?: boolean;
    agreement_version?: string;
    identity?: { person_id?: string; file_id?: string; side?: 'front' | 'back' };
    identity_upload?: {
      person_id?: string;
      side?: 'front' | 'back';
      filename?: string;
      content_type?: string;
      content_base64?: string;
    };
    confirm_archive_express?: boolean;
    wizard_draft?: Record<string, unknown>;
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
        owners: opts?.owners,
        bank_token: opts?.bank_token,
        tos_accepted: opts?.tos_accepted,
        agreement_version: opts?.agreement_version,
        identity: opts?.identity,
        identity_upload: opts?.identity_upload,
        confirm_archive_express: opts?.confirm_archive_express,
        wizard_draft: opts?.wizard_draft,
        returnOrigin:
          opts?.returnOrigin ??
          (typeof window !== 'undefined' ? window.location.origin : undefined),
      },
    }
  );
  if (error) {
    return { success: false, error: await edgeFunctionErrorMessage(error) };
  }
  if (!data?.success) {
    return { success: false, error: data?.error ?? 'Payout verification failed', ...data };
  }
  invalidateSupplierProfileCache();
  return data;
}

/** Stripe-hosted Account Link for Custom/Express KYC — status still comes from Stripe sync/webhooks. */
export async function fetchConnectAccountLink(): Promise<{
  url: string;
  accountId: string | null;
  expiresAt?: number;
  error?: string;
}> {
  const result = await invokeConnectSupplierOnboarding('account_link');
  if (!result.success) {
    return {
      url: '',
      accountId: null,
      error: connectOnboardingUserMessage(result.error),
    };
  }
  if (!result.url) {
    return { url: '', accountId: result.account_id ?? null, error: 'Missing Stripe onboarding URL' };
  }
  return {
    url: result.url,
    accountId: result.account_id ?? null,
    expiresAt: result.expires_at,
  };
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
    return {
      clientSecret: '',
      publishableKey: null,
      accountId: null,
      error: connectOnboardingUserMessage(result.error),
    };
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
