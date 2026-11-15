/**
 * Map Stripe Connect requirement field names to partner-safe copy.
 * Never surface raw representative personal data — only category labels.
 */

const LABELS: Record<string, string> = {
  business_type: 'Business type',
  external_account: 'Bank account for payouts',
  'tos_acceptance.date': 'Stripe terms acceptance',
  'tos_acceptance.ip': 'Stripe terms acceptance',
  'business_profile.url': 'Business website',
  'business_profile.mcc': 'Business category',
  'company.name': 'Company legal name',
  'company.tax_id': 'Company tax ID',
  'company.address.line1': 'Company address',
  'company.address.city': 'Company address',
  'company.address.postal_code': 'Company address',
  'company.address.country': 'Company address',
};

function categorize(raw: string): string {
  const key = raw.trim();
  if (!key) return 'Additional verification';
  if (LABELS[key]) return LABELS[key];
  if (key.startsWith('representative.')) return 'Account representative details';
  if (key.startsWith('individual.')) return 'Identity verification';
  if (key.startsWith('company.')) return 'Company details';
  if (key.startsWith('business_profile.')) return 'Business profile';
  if (key.includes('document') || key.includes('verification')) return 'Identity document verification';
  if (key.includes('external_account') || key.includes('bank')) return 'Bank account for payouts';
  return 'Additional verification';
}

/** Unique, human-readable requirement categories (no PII). */
export function humanizeConnectRequirements(due: unknown): string[] {
  const list = Array.isArray(due) ? due.map(String) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const label = categorize(item);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}
