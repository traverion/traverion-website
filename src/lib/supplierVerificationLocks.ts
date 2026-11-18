/** Contact for changing locked registration / payout details after verification. */
export const SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL = 'info@traverion.com';

/**
 * When true, suppliers must not edit business registration, address, tax IDs, verification documents.
 * Matches DB trigger rules for business columns only (not payout).
 *
 * - Verified: always locked.
 * - Pending after a real company submit with no staff feedback: locked.
 * - Rejected, or pending with non-empty `business_verification_feedback`: unlocked so they can fix and resubmit.
 * - Draft: unlocked.
 *
 * `businessTypeAtLastFetch` must reflect the last **server** value (or the value just saved), not in-progress dropdown edits.
 */
export function isSupplierBusinessIdentityLocked(
  verificationStatus: string | null | undefined,
  verificationSubmittedAt: string | null | undefined,
  businessTypeAtLastFetch: string | null | undefined,
  businessVerificationFeedback?: string | null | undefined
): boolean {
  const v = (verificationStatus ?? '').trim().toLowerCase();
  const submitted = (verificationSubmittedAt ?? '').trim() !== '';
  const typeSaved = (businessTypeAtLastFetch ?? '').trim() !== '';
  const feedback = (businessVerificationFeedback ?? '').trim();
  const needsChanges = v === 'rejected' || (v === 'pending' && feedback !== '');
  if (v === 'verified') return true;
  if (v === 'pending' && submitted && typeSaved && !needsChanges) return true;
  return false;
}

/**
 * When true, suppliers must not edit payout destination (method, IBAN, BIC, PayPal) or payout verification fields.
 * Independent from business verification.
 */
export function isSupplierPayoutDetailsLocked(
  payoutVerificationStatus: string | null | undefined,
  payoutVerificationSubmittedAt: string | null | undefined
): boolean {
  const v = (payoutVerificationStatus ?? '').trim().toLowerCase();
  const submitted = (payoutVerificationSubmittedAt ?? '').trim() !== '';
  if (v === 'verified') return true;
  if (v === 'pending' && submitted) return true;
  return false;
}
