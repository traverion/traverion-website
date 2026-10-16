import { describe, expect, it } from 'vitest';
import { emailConfirmHashNotice, immediateEmailVerifyNotice, isTravelerEmailConfirmLanding } from './emailVerifiedLanding';

describe('email confirmation landing', () => {
  it('treats the homepage flag and legacy confirm path as a landing', () => {
    expect(isTravelerEmailConfirmLanding({ pathname: '/', search: '?verified=1', hash: '' })).toBe(true);
    expect(isTravelerEmailConfirmLanding({ pathname: '/email-confirmed', search: '?next=account', hash: '' })).toBe(
      true,
    );
    expect(
      isTravelerEmailConfirmLanding({ pathname: '/', search: '', hash: '#access_token=abc&type=signup' }),
    ).toBe(true);
  });

  it('leaves password recovery and ordinary pages alone', () => {
    expect(isTravelerEmailConfirmLanding({ pathname: '/set-password', search: '', hash: '#type=recovery' })).toBe(
      false,
    );
    expect(isTravelerEmailConfirmLanding({ pathname: '/packages', search: '', hash: '' })).toBe(false);
  });

  it('shows the success modal on the first frame of a confirmation link', () => {
    expect(immediateEmailVerifyNotice({ pathname: '/', search: '?verified=1', hash: '' })).toBe('success');
    expect(
      immediateEmailVerifyNotice({ pathname: '/email-confirmed', search: '', hash: '#access_token=abc&type=signup' }),
    ).toBe('success');
    expect(
      immediateEmailVerifyNotice({
        pathname: '/',
        search: '?verified=1',
        hash: '#error=access_denied&error_code=otp_expired&type=signup',
      }),
    ).toBe('expired');
    expect(immediateEmailVerifyNotice({ pathname: '/packages', search: '', hash: '' })).toBe(null);
  });

  it('classifies an expired confirmation hash without sending it to login', () => {
    expect(emailConfirmHashNotice('#error=access_denied&error_code=otp_expired&type=signup')).toBe('expired');
    expect(emailConfirmHashNotice('#error=access_denied&error_code=otp_expired&type=recovery')).toBe(null);
    expect(emailConfirmHashNotice('#error=access_denied&error_description=bad')).toBe('invalid');
  });
});
