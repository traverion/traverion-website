import { describe, expect, it } from 'vitest';
import { authUserVerifiedEmail } from './auth-verified-email';

describe('authUserVerifiedEmail (Phase 1119)', () => {
  it('returns null when email is unconfirmed', () => {
    expect(
      authUserVerifiedEmail({ email: 'guest@example.com', email_confirmed_at: null })
    ).toBeNull();
    expect(authUserVerifiedEmail({ email: 'guest@example.com' })).toBeNull();
  });

  it('returns lowercased email when confirmed', () => {
    expect(
      authUserVerifiedEmail({
        email: '  Guest@Example.COM ',
        email_confirmed_at: '2026-01-01T00:00:00Z',
      })
    ).toBe('guest@example.com');
  });

  it('returns null without an email', () => {
    expect(authUserVerifiedEmail({ email: '', email_confirmed_at: '2026-01-01T00:00:00Z' })).toBeNull();
    expect(authUserVerifiedEmail(null)).toBeNull();
  });
});
