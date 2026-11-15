/**
 * Map Stripe Connect requirement field names to partner-safe copy.
 * Prefer specific readable labels; never surface raw PII values.
 */

export type RequirementGroupId = 'business' | 'representative' | 'bank' | 'agreements' | 'other';

export type RequirementGroup = {
  id: RequirementGroupId;
  title: string;
  items: string[];
};

const FIELD_LABELS: Record<string, string> = {
  business_type: 'Business type',
  external_account: 'Bank account required',
  'tos_acceptance.date': 'Accept Stripe terms of service',
  'tos_acceptance.ip': 'Accept Stripe terms of service',
  'business_profile.url': 'Business website',
  'business_profile.mcc': 'Business category',
  'company.name': 'Legal business name',
  'company.tax_id': 'Company tax ID',
  'company.address.line1': 'Company street address',
  'company.address.city': 'Company city',
  'company.address.postal_code': 'Company postal code',
  'company.address.country': 'Company country',
  // Name/email/phone collapse to one partner-safe bucket (no raw field keys).
  'representative.first_name': 'Account representative details',
  'representative.last_name': 'Account representative details',
  'representative.email': 'Account representative details',
  'representative.phone': 'Account representative details',
  'representative.dob.day': "Representative's date of birth",
  'representative.dob.month': "Representative's date of birth",
  'representative.dob.year': "Representative's date of birth",
  'representative.address.line1': "Representative's address",
  'representative.address.city': "Representative's address",
  'representative.address.postal_code': "Representative's address",
  'representative.address.country': "Representative's address",
  'individual.first_name': 'Identity verification',
  'individual.last_name': 'Identity verification',
  'individual.dob.day': 'Date of birth',
  'individual.dob.month': 'Date of birth',
  'individual.dob.year': 'Date of birth',
  'individual.verification.document': 'Identity verification',
  'individual.verification.additional_document': 'Identity verification',
};

function labelFor(raw: string): string {
  const key = raw.trim();
  if (!key) return 'Additional verification';
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (key.startsWith('representative.dob')) return "Representative's date of birth";
  if (key.startsWith('representative.address')) return "Representative's address";
  if (key.startsWith('representative.')) return 'Account representative details';
  if (key.startsWith('individual.dob')) return 'Date of birth';
  if (key.startsWith('individual.verification')) return 'Identity verification';
  if (key.startsWith('individual.')) return 'Identity verification';
  if (key.startsWith('company.address')) return 'Company address';
  if (key.startsWith('company.')) return 'Company details';
  if (key.startsWith('business_profile.')) return 'Business profile';
  if (key.includes('external_account') || key.includes('bank')) return 'Bank account required';
  if (key.includes('tos_acceptance')) return 'Accept Stripe terms of service';
  if (key.includes('document') || key.includes('verification')) return 'Identity verification';
  return 'Additional verification';
}

function groupFor(raw: string): RequirementGroupId {
  const key = raw.trim();
  if (key.startsWith('tos_acceptance') || key.includes('tos_acceptance')) return 'agreements';
  if (key.includes('external_account') || key.includes('bank')) return 'bank';
  if (key.startsWith('representative.') || key.startsWith('individual.')) return 'representative';
  if (
    key.startsWith('company.') ||
    key.startsWith('business_') ||
    key.startsWith('business_profile.') ||
    key === 'business_type'
  ) {
    return 'business';
  }
  return 'other';
}

const GROUP_TITLE: Record<RequirementGroupId, string> = {
  business: 'Business',
  representative: 'Representative',
  bank: 'Bank account',
  agreements: 'Agreements',
  other: 'Additional',
};

/** Unique, human-readable requirement labels (no raw Stripe keys, no PII values). */
export function humanizeConnectRequirements(due: unknown): string[] {
  const list = Array.isArray(due) ? due.map(String) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const label = labelFor(item);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Group outstanding requirements for guided payout setup UI. */
export function groupConnectRequirements(due: unknown): RequirementGroup[] {
  const list = Array.isArray(due) ? due.map(String) : [];
  const buckets = new Map<RequirementGroupId, Set<string>>();
  for (const item of list) {
    const id = groupFor(item);
    const label = labelFor(item);
    if (!buckets.has(id)) buckets.set(id, new Set());
    buckets.get(id)!.add(label);
  }
  const order: RequirementGroupId[] = ['business', 'representative', 'bank', 'agreements', 'other'];
  return order
    .filter((id) => (buckets.get(id)?.size ?? 0) > 0)
    .map((id) => ({
      id,
      title: GROUP_TITLE[id],
      items: [...(buckets.get(id) ?? [])],
    }));
}

/**
 * Express accounts with Stripe-collected requirements require Stripe user authentication
 * inside embedded components. Custom/platform-collected accounts can disable it.
 */
export const EXPRESS_STRIPE_AUTH_LIMITATION =
  'Royal Nordic uses a LIVE Express Connect account where Stripe collects verification requirements. Stripe requires a short secure sign-in (email or SMS code) before sensitive onboarding steps. This cannot be disabled for Express without migrating to a Custom account configuration — which is out of scope for this pilot.';
