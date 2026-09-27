import { describe, expect, it } from 'vitest';
import { resolveCheckoutSiteUrl, sanitizeCheckoutReturnPath } from './checkout-paths';

describe('sanitizeCheckoutReturnPath', () => {
  const fallback = '/booking-confirmed';

  it('keeps same-site paths', () => {
    expect(sanitizeCheckoutReturnPath('/booking-confirmed', fallback)).toBe('/booking-confirmed');
    expect(sanitizeCheckoutReturnPath('/bookings?payment=cancelled', fallback)).toBe(
      '/bookings?payment=cancelled'
    );
  });

  it('rejects open redirects', () => {
    expect(sanitizeCheckoutReturnPath('https://evil.example/phish', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath('//evil.example', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath('/\\evil.example', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath('/https://evil.example/phish', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath(undefined, fallback)).toBe(fallback);
  });
});

describe('resolveCheckoutSiteUrl', () => {
  const prod = 'https://www.traverion.com';

  it('defaults to PUBLIC_SITE_URL when returnOrigin omitted', () => {
    expect(resolveCheckoutSiteUrl({ publicSiteUrl: prod })).toBe(prod);
    expect(resolveCheckoutSiteUrl({ publicSiteUrl: `${prod}/` })).toBe(prod);
  });

  it('allows local Vite origins so sandbox checkout returns to localhost', () => {
    expect(
      resolveCheckoutSiteUrl({ publicSiteUrl: prod, returnOrigin: 'http://127.0.0.1:5173' })
    ).toBe('http://127.0.0.1:5173');
    expect(
      resolveCheckoutSiteUrl({ publicSiteUrl: prod, returnOrigin: 'http://localhost:5173/' })
    ).toBe('http://localhost:5173');
  });

  it('rejects unlisted origins (open redirect)', () => {
    expect(
      resolveCheckoutSiteUrl({ publicSiteUrl: prod, returnOrigin: 'https://evil.example' })
    ).toBe(prod);
    expect(
      resolveCheckoutSiteUrl({
        publicSiteUrl: prod,
        returnOrigin: 'http://127.0.0.1:5173/phish',
      })
    ).toBe(prod);
    expect(
      resolveCheckoutSiteUrl({
        publicSiteUrl: prod,
        returnOrigin: 'javascript:alert(1)',
      })
    ).toBe(prod);
  });

  it('honors extraAllowedOrigins for staging previews', () => {
    expect(
      resolveCheckoutSiteUrl({
        publicSiteUrl: prod,
        returnOrigin: 'https://preview.example',
        extraAllowedOrigins: ['https://preview.example'],
      })
    ).toBe('https://preview.example');
  });
});
