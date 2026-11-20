import { describe, expect, it } from 'vitest';
import {
  authRejectionIsSignedPlatformJwt,
  bearerJwtRole,
} from '../../supabase/functions/_shared/notify-customer-booking-auth';

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('service-role request recognition', () => {
  it('reads the role claim and ignores anon tokens', () => {
    expect(bearerJwtRole(jwt({ role: 'service_role', ref: 'staging' }))).toBe('service_role');
    expect(bearerJwtRole(jwt({ role: 'anon' }))).toBe('anon');
    expect(bearerJwtRole('not-a-jwt')).toBeNull();
  });

  it('accepts only the signed platform rejection for a key with no user subject', () => {
    expect(authRejectionIsSignedPlatformJwt({ msg: 'invalid claim: missing sub claim' })).toBe(true);
    expect(authRejectionIsSignedPlatformJwt({ msg: 'invalid JWT: unable to parse or verify signature, token signature is invalid: signature is invalid' })).toBe(false);
  });
});
