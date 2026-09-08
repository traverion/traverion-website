import { describe, expect, it } from 'vitest';
import { sanitizeAuthRedirectTo, sanitizeEmailConfirmNext } from './authRedirect';

describe('auth redirect sanitization', () => {
  const origin = 'https://www.traverion.com';
  const fallback = 'https://www.traverion.com/email-confirmed?next=account';

  it('keeps same-origin confirmation URLs', () => {
    expect(sanitizeAuthRedirectTo('https://www.traverion.com/email-confirmed?next=bookings', origin, fallback)).toBe(
      'https://www.traverion.com/email-confirmed?next=bookings'
    );
  });

  it('rejects open redirects', () => {
    expect(sanitizeAuthRedirectTo('https://evil.example/phish', origin, fallback)).toBe(fallback);
    expect(sanitizeAuthRedirectTo('https://www.traverion.com.evil.example/', origin, fallback)).toBe(fallback);
    expect(sanitizeAuthRedirectTo('//evil.example', origin, fallback)).toBe(fallback);
  });

  it('rejects unknown next page keys', () => {
    expect(sanitizeEmailConfirmNext('https://evil.example')).toBe('home');
    expect(sanitizeEmailConfirmNext('admin')).toBe('home');
    expect(sanitizeEmailConfirmNext('bookings')).toBe('bookings');
  });
});
