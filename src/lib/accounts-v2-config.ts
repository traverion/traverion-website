/**
 * Accounts v2 recipient configuration for new Finnish suppliers.
 * LIVE creation uses this same body and stays behind the disabled creation gate.
 */

export const ACCOUNTS_V2_STRIPE_VERSION = '2026-10-28.preview';

export type V2RequirementEntry = {
  description?: string | null;
  minimum_deadline?: { status?: string | null } | null;
  errors?: unknown[] | null;
};

export type V2AccountSnapshot = {
  id?: string;
  livemode?: boolean;
  dashboard?: string | null;
  applied_configurations?: string[] | null;
  identity?: { country?: string | null; entity_type?: string | null } | null;
  defaults?: {
    responsibilities?: {
      fees_collector?: string | null;
      losses_collector?: string | null;
      requirements_collector?: string | null;
    } | null;
  } | null;
  configuration?: {
    merchant?: unknown;
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string | null } | null;
          payouts?: { status?: string | null } | null;
        } | null;
      } | null;
    } | null;
  } | null;
  requirements?: { entries?: V2RequirementEntry[] | null } | null;
  metadata?: Record<string, string> | null;
};

export const V2_RETRIEVE_INCLUDE = [
  'configuration.recipient',
  'configuration.merchant',
  'defaults',
  'identity',
  'requirements',
] as const;

export function finlandSupplierCountry(raw: string | null | undefined): 'FI' | null {
  const value = (raw ?? '').trim().toUpperCase();
  // Missing country must not become Finland. LIVE and TEST both require an explicit FI value.
  if (value === 'FI' || value === 'FINLAND') return 'FI';
  return null;
}

export function buildV2RecipientCreateBody(input: {
  email?: string;
  displayName?: string;
  supplierId: string;
  environment: 'test' | 'live';
}): Record<string, unknown> {
  return {
    contact_email: input.email,
    display_name: input.displayName || 'Traverion supplier',
    dashboard: 'none',
    identity: {
      country: 'fi',
      entity_type: 'company',
    },
    defaults: {
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
      profile: {
        business_url: 'https://traverion.com',
        product_description: 'Travel experiences and stays sold on Traverion',
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    metadata: {
      traverion_supplier_id: input.supplierId,
      traverion_environment: input.environment,
      traverion_account_api: 'v2',
      traverion_onboarding: 'accounts_v2',
    },
    include: [...V2_RETRIEVE_INCLUDE],
  };
}

export function assertV2RecipientConfig(
  account: V2AccountSnapshot
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const responsibilities = account.defaults?.responsibilities;
  const configs = account.applied_configurations ?? [];
  const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
  if (account.dashboard !== 'none') problems.push(`dashboard=${account.dashboard ?? 'missing'}`);
  if (responsibilities?.requirements_collector !== 'application') {
    problems.push(`requirements_collector=${responsibilities?.requirements_collector ?? 'missing'}`);
  }
  if (responsibilities?.losses_collector !== 'application') {
    problems.push(`losses_collector=${responsibilities?.losses_collector ?? 'missing'}`);
  }
  if (responsibilities?.fees_collector !== 'application') {
    problems.push(`fees_collector=${responsibilities?.fees_collector ?? 'missing'}`);
  }
  if (!configs.includes('recipient')) problems.push('recipient configuration missing');
  if (configs.includes('merchant') || account.configuration?.merchant != null) {
    problems.push('merchant configuration present');
  }
  if (!transfers) problems.push('stripe_transfers missing');
  const serialized = JSON.stringify(account.configuration ?? {});
  if (serialized.includes('card_payments')) problems.push('card_payments present');
  const country = (account.identity?.country ?? '').toUpperCase();
  if (country && country !== 'FI') problems.push(`country=${country}`);
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

export function v2RequirementBuckets(account: V2AccountSnapshot): {
  currentlyDue: string[];
  pastDue: string[];
  pending: string[];
  other: Array<{ description: string; status: string }>;
} {
  const currentlyDue: string[] = [];
  const pastDue: string[] = [];
  const pending: string[] = [];
  const other: Array<{ description: string; status: string }> = [];
  for (const entry of account.requirements?.entries ?? []) {
    const description = (entry.description ?? '').trim();
    if (!description) continue;
    const status = (entry.minimum_deadline?.status ?? '').trim();
    if (status === 'currently_due') currentlyDue.push(description);
    else if (status === 'past_due') pastDue.push(description);
    else if (status === 'pending_verification' || status === 'pending') pending.push(description);
    else other.push({ description, status: status || 'unknown' });
  }
  return { currentlyDue, pastDue, pending, other };
}

export function isAccountsV2Native(account: V2AccountSnapshot | null | undefined): boolean {
  return account?.metadata?.traverion_account_api === 'v2';
}

/** Authoritative transfer capability for a v2 account. Missing means not verified. */
export function v2StripeTransfersStatus(account: V2AccountSnapshot | null | undefined): string {
  return (
    account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ??
    'missing'
  );
}
