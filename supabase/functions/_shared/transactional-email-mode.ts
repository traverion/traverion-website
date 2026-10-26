/**
 * Staging / cert environments may set TRANSACTIONAL_EMAIL_MODE=log_only
 * so notify functions claim idempotency and return success without calling Resend.
 * Never set this on production.
 */
export function isTransactionalEmailLogOnly(): boolean {
  return (Deno.env.get('TRANSACTIONAL_EMAIL_MODE') || '').trim().toLowerCase() === 'log_only';
}
