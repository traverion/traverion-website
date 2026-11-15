/**
 * Partner login — when to show confirmation resend / check-email notice.
 * Never infer account existence from an arbitrary email alone.
 */

export function isEmailConfirmationRequiredMessage(message: string | null | undefined): boolean {
  const m = (message ?? '').toLowerCase();
  if (!m) return false;
  return (
    m.includes('email not confirmed') ||
    m.includes('confirm your email') ||
    m.includes('confirmation link has expired') ||
    m.includes('confirmation link expired') ||
    m.includes('request a new confirmation')
  );
}

/** Show “Resend confirmation email” only after auth confirms verification is needed. */
export function shouldShowPartnerConfirmationResend(opts: {
  needsEmailConfirmation: boolean;
  confirmationEmailRequested: boolean;
  emailError?: string | null;
  formError?: string | null;
}): boolean {
  if (opts.needsEmailConfirmation || opts.confirmationEmailRequested) return true;
  return (
    isEmailConfirmationRequiredMessage(opts.emailError) ||
    isEmailConfirmationRequiredMessage(opts.formError)
  );
}

/** Map Auth resend failures without revealing whether the address has an account. */
export function mapPartnerConfirmationResendError(rawMessage: string): {
  kind: 'rate_limit' | 'generic_failure' | 'treat_as_requested';
  message: string;
} {
  const m = rawMessage.toLowerCase();
  if (
    m.includes('rate limit') ||
    m.includes('too many') ||
    m.includes('over_email') ||
    m.includes('email send rate') ||
    m.includes('429')
  ) {
    return {
      kind: 'rate_limit',
      message: 'Too many confirmation emails requested. Wait a few minutes, then try again.',
    };
  }
  // User missing / already confirmed / soft Auth errors — same UX as a successful request
  // so the form never discloses whether an arbitrary address is registered.
  if (
    m.includes('user not found') ||
    m.includes('user does not exist') ||
    m.includes('email not found') ||
    m.includes('unable to find') ||
    m.includes('already confirmed') ||
    m.includes('already been confirmed') ||
    m.includes('email change') ||
    m.includes('signup is disabled')
  ) {
    return { kind: 'treat_as_requested', message: '' };
  }
  return {
    kind: 'generic_failure',
    message: 'Could not request a confirmation email right now. Try again shortly.',
  };
}
