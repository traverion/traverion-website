/** Contact for changing locked registration / payout details after verification. */
export const SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL = 'info@traverion.com';

/**
 * When true, suppliers must not edit business registration, address, tax IDs, verification documents,
 * or payout destination (method / IBAN / BIC / PayPal). Matches DB trigger rules.
 *
 * - Verified: always locked.
 * - Pending after `verification_submitted_at` was set (company details saved for review): locked.
 * - Rejected or draft (no submission timestamp): unlocked so they can fix and resubmit.
 */
export function isSupplierSensitiveIdentityLocked(
  verificationStatus: string | null | undefined,
  verificationSubmittedAt: string | null | undefined
): boolean {
  const v = (verificationStatus ?? '').trim().toLowerCase();
  const submitted = (verificationSubmittedAt ?? '').trim() !== '';
  if (v === 'verified') return true;
  if (v === 'pending' && submitted) return true;
  return false;
}
