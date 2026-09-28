import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('BookingPage pay-step contact review (Phase 1593)', () => {
  const src = readFileSync(join(here, 'BookingPage.tsx'), 'utf8');

  it('does not repeat BOOKING_CONTACT_EMAIL_FIELD_NOTE under pay-step contact review', () => {
    expect(src).toContain('Phase 1593');
    expect(src).toMatch(
      /Phase 1593: Trips email honesty lives in After you pay[\s\S]*bookingPayConfirmAfterPayCopy/
    );
    // Field note remains on contact step email hint only (one occurrence of the JSX usage pattern).
    const fieldNoteJsx = src.match(/\{BOOKING_CONTACT_EMAIL_FIELD_NOTE\}/g) ?? [];
    expect(fieldNoteJsx.length).toBe(1);
  });
});

describe('BookingPage review-step Stripe TEST phrasing (Phase 1595)', () => {
  const src = readFileSync(join(here, 'BookingPage.tsx'), 'utf8');

  it('uses pay via + STRIPE_TEST_UNTIL_LIVE (StayDetails 1594 parity)', () => {
    expect(src).toContain('Phase 1595');
    expect(src).toMatch(
      /Phase 1595: Stripe TEST as a clear clause[\s\S]*then pay via\{\s*' '\s*\}\s*\{STRIPE_TEST_UNTIL_LIVE\}/
    );
    expect(src).not.toMatch(/then pay on\{\s*' '\s*\}\s*\{STRIPE_TEST_UNTIL_LIVE\}/);
  });
});
