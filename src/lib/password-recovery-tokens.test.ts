import { describe, expect, it } from 'vitest';
import { readRecoverySessionTokens } from './passwordRecoveryFlow';

describe('readRecoverySessionTokens', () => {
  it('reads a supplier reset link that put the session in the query string', () => {
    const tokens = readRecoverySessionTokens(
      '?access_token=access&refresh_token=refresh&type=recovery',
      ''
    );
    expect(tokens).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('prefers the hash when both are present', () => {
    const tokens = readRecoverySessionTokens(
      '?access_token=query-access&refresh_token=query-refresh&type=recovery',
      '#access_token=hash-access&refresh_token=hash-refresh&type=recovery'
    );
    expect(tokens).toEqual({ accessToken: 'hash-access', refreshToken: 'hash-refresh' });
  });

  it('ignores a non-recovery token pair', () => {
    expect(
      readRecoverySessionTokens('?access_token=access&refresh_token=refresh&type=signup', '')
    ).toBeNull();
  });
});
