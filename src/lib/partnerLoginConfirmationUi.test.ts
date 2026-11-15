import { describe, expect, it } from 'vitest';
import {
  isEmailConfirmationRequiredMessage,
  mapPartnerConfirmationResendError,
  shouldShowPartnerConfirmationResend,
} from './partnerLoginConfirmationUi';

describe('partnerLoginConfirmationUi', () => {
  it('hides resend by default on a clean login form', () => {
    expect(
      shouldShowPartnerConfirmationResend({
        needsEmailConfirmation: false,
        confirmationEmailRequested: false,
      })
    ).toBe(false);
  });

  it('shows resend only when Auth requires verification or a confirmation was requested', () => {
    expect(
      shouldShowPartnerConfirmationResend({
        needsEmailConfirmation: true,
        confirmationEmailRequested: false,
      })
    ).toBe(true);
    expect(
      shouldShowPartnerConfirmationResend({
        needsEmailConfirmation: false,
        confirmationEmailRequested: true,
      })
    ).toBe(true);
    expect(
      shouldShowPartnerConfirmationResend({
        needsEmailConfirmation: false,
        confirmationEmailRequested: false,
        emailError: 'Please confirm your email before signing in.',
      })
    ).toBe(true);
    expect(
      shouldShowPartnerConfirmationResend({
        needsEmailConfirmation: false,
        confirmationEmailRequested: false,
        emailError: 'Incorrect email or password.',
      })
    ).toBe(false);
  });

  it('detects confirmation-required copy without leaking unrelated errors', () => {
    expect(isEmailConfirmationRequiredMessage('Email not confirmed')).toBe(true);
    expect(isEmailConfirmationRequiredMessage('This confirmation link has expired')).toBe(true);
    expect(isEmailConfirmationRequiredMessage('Incorrect email or password.')).toBe(false);
  });

  it('maps resend failures without account enumeration', () => {
    expect(mapPartnerConfirmationResendError('User not found').kind).toBe('treat_as_requested');
    expect(mapPartnerConfirmationResendError('Email rate limit exceeded').kind).toBe('rate_limit');
    expect(mapPartnerConfirmationResendError('SMTP is down').kind).toBe('generic_failure');
    expect(mapPartnerConfirmationResendError('Email rate limit exceeded').message).toMatch(/few minutes/i);
  });
});
