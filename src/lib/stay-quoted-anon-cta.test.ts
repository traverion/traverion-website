import { describe, expect, it } from 'vitest';

/**
 * Phase 1519: after a valid stay quote, anon CTA must start checkout (requestAuth inside),
 * not hard-navigate to /log-in?next=stays.
 */
export function stayQuotedAnonCtaIsLoginHref(href: string | null | undefined): boolean {
  const h = (href ?? '').trim().toLowerCase();
  if (!h) return false;
  return h.includes('/log-in') || h.includes('/login') || h.includes('next=stays');
}

describe('stayQuotedAnonCtaIsLoginHref', () => {
  it('flags hard login links used before Phase 1519', () => {
    expect(stayQuotedAnonCtaIsLoginHref('/log-in?next=stays')).toBe(true);
    expect(stayQuotedAnonCtaIsLoginHref('/login?next=stays')).toBe(true);
  });

  it('allows button CTAs with no href', () => {
    expect(stayQuotedAnonCtaIsLoginHref(null)).toBe(false);
    expect(stayQuotedAnonCtaIsLoginHref(undefined)).toBe(false);
    expect(stayQuotedAnonCtaIsLoginHref('')).toBe(false);
  });
});
