import { describe, expect, it } from 'vitest';
import {
  WHAT_TO_BRING_CATALOG,
  accessibilityContradictionMessages,
  normalizeWhatToBringIds,
  normalizeSpokenLanguageIds,
} from './listing-information-catalogs';
import { findOffPlatformListingTextIssues } from './listing-off-platform-text';
import { validateBookingContactPhone } from './listing-booking-contact-phone';

describe('listing information catalogs', () => {
  it('keeps warm clothing, winter boots, gloves, and winter hat as distinct items', () => {
    const ids = new Set(WHAT_TO_BRING_CATALOG.map((o) => o.id));
    expect(ids.has('warm_clothing')).toBe(true);
    expect(ids.has('winter_boots')).toBe(true);
    expect(ids.has('gloves')).toBe(true);
    expect(ids.has('winter_hat')).toBe(true);
    expect(WHAT_TO_BRING_CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it('filters invalid catalog ids', () => {
    expect(normalizeWhatToBringIds(['gloves', 'not-real', 'gloves', 'scarf'])).toEqual([
      'gloves',
      'scarf',
    ]);
  });

  it('normalizes spoken language codes', () => {
    expect(normalizeSpokenLanguageIds(['en', 'fi', 'xx', 'sv'])).toEqual(['en', 'fi', 'sv']);
  });

  it('detects accessibility contradictions', () => {
    const msgs = accessibilityContradictionMessages(
      ['wheelchair_users'],
      ['wheelchair_accessible', 'seating_available']
    );
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toMatch(/Wheelchair users/i);
  });
});

describe('off-platform listing text', () => {
  it('flags booking URLs and off-platform payment language', () => {
    const issues = findOffPlatformListingTextIssues('Book directly at www.example.com or pay us directly');
    expect(issues.some((i) => i.kind === 'url')).toBe(true);
    expect(issues.some((i) => i.kind === 'off_platform_booking')).toBe(true);
  });

  it('allows ordinary safety contact wording without booking solicitation', () => {
    const issues = findOffPlatformListingTextIssues(
      'If you are late, tell the guide at the meeting point.'
    );
    expect(issues).toEqual([]);
  });
});

describe('booking contact phone', () => {
  it('validates Finnish numbers to E.164', () => {
    const ok = validateBookingContactPhone('040 123 4567', 'FI');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.e164).toMatch(/^\+358/);
  });

  it('rejects empty phone for publish', () => {
    const bad = validateBookingContactPhone('');
    expect(bad.ok).toBe(false);
  });
});
