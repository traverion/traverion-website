/**
 * Accounts v2 lifecycle decisions for stripe-webhook.
 * Thin events carry an account id, not the account state. Callers retrieve
 * the account and pass that snapshot here. A webhook delivery is never proof
 * that a supplier is Verified.
 */
import type { ConnectProfileMirror } from './connect-account-mirror.ts';
import {
  v2RequirementBuckets,
  v2StripeTransfersStatus,
  type V2AccountSnapshot,
} from './accounts-v2-config.ts';

/** Thin events that can change verification or transfer capability. */
export const ACCOUNTS_V2_LIFECYCLE_EVENTS = [
  'v2.core.account.created',
  'v2.core.account.updated',
  'v2.core.account.closed',
  'v2.core.account[configuration.recipient].updated',
  'v2.core.account[configuration.recipient].capability_status_updated',
  'v2.core.account[defaults].updated',
  'v2.core.account[identity].updated',
  'v2.core.account[requirements].updated',
  'v2.core.account[future_requirements].updated',
] as const;

export function isAccountsV2LifecycleEvent(type: string | null | undefined): boolean {
  return ACCOUNTS_V2_LIFECYCLE_EVENTS.includes(type as (typeof ACCOUNTS_V2_LIFECYCLE_EVENTS)[number]);
}

export function v2AccountIdFromThinEvent(event: {
  related_object?: { id?: string | null; type?: string | null; url?: string | null } | null;
  account?: string | null;
}): string | null {
  const related = (event.related_object?.id ?? '').trim();
  if (related.startsWith('acct_')) return related;
  const url = (event.related_object?.url ?? '').trim();
  const fromUrl = url.match(/\/v2\/core\/accounts\/(acct_[A-Za-z0-9]+)/)?.[1];
  if (fromUrl) return fromUrl;
  const account = (event.account ?? '').trim();
  return account.startsWith('acct_') ? account : null;
}

export function connectAccountLinkDecision(input: {
  supplierId: string | null;
  supplierLivemode: boolean | null;
  eventLivemode: boolean;
  metadataSupplierId: string | null;
  accountType: string | null;
}): { action: 'mirror' | 'ignore'; reason: string } {
  if (!input.supplierId) return { action: 'ignore', reason: 'unlinked_connect_account' };
  if (input.supplierLivemode === true && input.eventLivemode === false) {
    return { action: 'ignore', reason: 'test_event_on_live_supplier' };
  }
  if (input.supplierLivemode === false && input.eventLivemode === true) {
    return { action: 'ignore', reason: 'live_event_on_test_supplier' };
  }
  const metadataSupplierId = (input.metadataSupplierId ?? '').trim();
  if (metadataSupplierId && metadataSupplierId !== input.supplierId) {
    return { action: 'ignore', reason: 'ownership_mismatch' };
  }
  const accountType = (input.accountType ?? '').toLowerCase();
  const expressLinked = accountType === 'express';
  if (!metadataSupplierId && !expressLinked) {
    return { action: 'ignore', reason: 'missing_ownership_metadata' };
  }
  return { action: 'mirror', reason: 'linked_supplier' };
}

/**
 * Overlay the retrieved Accounts v2 snapshot onto a v1 mirror.
 * Requirement keys are stored. Identity values and bank details are not.
 */
export function applyAuthoritativeV2Status(
  mirror: ConnectProfileMirror,
  account: V2AccountSnapshot & { closed?: boolean | null },
  nowIso = mirror.connect_last_synced_at
): ConnectProfileMirror {
  const buckets = v2RequirementBuckets(account);
  const hasRequirementEntries = Array.isArray(account.requirements?.entries);
  const currentlyDue = hasRequirementEntries ? buckets.currentlyDue : mirror.connect_requirements_currently_due;
  const pastDue = hasRequirementEntries ? buckets.pastDue : mirror.connect_requirements_past_due;
  const transfers = v2StripeTransfersStatus(account);
  const closed = account.closed === true;
  const livemode =
    typeof account.livemode === 'boolean' ? account.livemode : mirror.connect_account_livemode;
  const rejected =
    closed || /rejected|listed/i.test(mirror.connect_disabled_reason ?? '');
  let status = mirror.connect_onboarding_status;
  if (rejected) status = 'rejected';
  else if (pastDue.length > 0 || currentlyDue.length > 0) status = 'restricted';
  else if (buckets.pending.length > 0) status = 'pending';
  else if (transfers !== 'active') status = 'restricted';
  else if (mirror.connect_details_submitted) status = 'complete';
  const payoutsEnabled = !closed && transfers === 'active' && status === 'complete';
  return {
    ...mirror,
    connect_account_livemode: livemode,
    connect_requirements_currently_due: [...currentlyDue],
    connect_requirements_past_due: [...pastDue],
    connect_payouts_enabled: payoutsEnabled,
    connect_onboarding_status: status,
    connect_disabled_reason: closed ? 'account_closed' : mirror.connect_disabled_reason,
    connect_last_synced_at: nowIso,
    payout_rail: payoutsEnabled ? 'stripe_connect' : 'manual_iban',
  };
}
