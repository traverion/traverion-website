/** Map a Stripe Connect Account into Traverion supplier_profiles mirrors. */

export type ConnectAccountLike = {
  id: string;
  type?: string | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
  default_currency?: string | null;
  country?: string | null;
  requirements?: {
    currently_due?: string[] | null;
    past_due?: string[] | null;
    disabled_reason?: string | null;
  } | null;
  settings?: {
    payouts?: {
      debit_negative_balances?: boolean | null;
      schedule?: { interval?: string | null } | null;
    } | null;
  } | null;
};

export type ConnectProfileMirror = {
  stripe_connected_account_id: string;
  connect_account_type: 'express' | 'custom' | 'standard' | null;
  connect_charges_enabled: boolean;
  connect_payouts_enabled: boolean;
  connect_details_submitted: boolean;
  connect_disabled_reason: string | null;
  connect_requirements_currently_due: string[];
  connect_requirements_past_due: string[];
  connect_default_currency: string | null;
  connect_country: string | null;
  connect_debit_negative_balances: boolean;
  connect_onboarding_status: 'not_started' | 'pending' | 'restricted' | 'complete' | 'rejected';
  connect_last_synced_at: string;
  payout_rail: 'stripe_connect' | 'manual_iban';
};

export function deriveConnectOnboardingStatus(account: ConnectAccountLike): ConnectProfileMirror['connect_onboarding_status'] {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];
  const disabled = (account.requirements?.disabled_reason ?? '').trim();
  if (disabled && /rejected|listed|other/i.test(disabled)) return 'rejected';
  if (pastDue.length > 0 || currentlyDue.length > 0 || disabled) return 'restricted';
  if (account.details_submitted && account.payouts_enabled) return 'complete';
  if (account.details_submitted || currentlyDue.length > 0) return 'pending';
  return 'pending';
}

/** Never treat a browser return URL alone as verified — always sync from Stripe. */
export function mirrorConnectAccount(account: ConnectAccountLike, nowIso = new Date().toISOString()): ConnectProfileMirror {
  const status = deriveConnectOnboardingStatus(account);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const rawType = (account.type ?? '').toLowerCase();
  const accountType =
    rawType === 'express' || rawType === 'custom' || rawType === 'standard' ? rawType : null;
  return {
    stripe_connected_account_id: account.id,
    connect_account_type: accountType,
    connect_charges_enabled: Boolean(account.charges_enabled),
    connect_payouts_enabled: payoutsEnabled,
    connect_details_submitted: Boolean(account.details_submitted),
    connect_disabled_reason: account.requirements?.disabled_reason ?? null,
    connect_requirements_currently_due: [...(account.requirements?.currently_due ?? [])],
    connect_requirements_past_due: [...(account.requirements?.past_due ?? [])],
    connect_default_currency: account.default_currency
      ? String(account.default_currency).toUpperCase()
      : null,
    connect_country: account.country ? String(account.country).toUpperCase() : null,
    // Launch policy: never auto-debit supplier banks even if Stripe reports true.
    connect_debit_negative_balances: false,
    connect_onboarding_status: status,
    connect_last_synced_at: nowIso,
    payout_rail: payoutsEnabled && status === 'complete' ? 'stripe_connect' : 'manual_iban',
  };
}

export function connectCanReceiveTransfers(mirror: Pick<ConnectProfileMirror, 'connect_payouts_enabled' | 'connect_onboarding_status' | 'connect_requirements_currently_due' | 'connect_requirements_past_due'>): boolean {
  if (!mirror.connect_payouts_enabled) return false;
  if (mirror.connect_onboarding_status === 'restricted' || mirror.connect_onboarding_status === 'rejected') {
    return false;
  }
  if ((mirror.connect_requirements_currently_due?.length ?? 0) > 0) return false;
  if ((mirror.connect_requirements_past_due?.length ?? 0) > 0) return false;
  return mirror.connect_onboarding_status === 'complete';
}
