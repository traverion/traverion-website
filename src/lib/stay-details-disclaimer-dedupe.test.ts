import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('StayDetails sticky disclaimer (Phase 1586)', () => {
  const src = readFileSync(join(here, '../pages/StayDetails.tsx'), 'utf8');

  it('keeps STAY_LISTING note as title only — no duplicated email disclaimer or hardcoded TEST line', () => {
    expect(src).toContain('title={STAY_LISTING_CONFIRMATION_NOTE}');
    expect(src).toContain('stripeSecureCheckoutFootnote');
    expect(src).not.toContain('STRIPE_TEST_UNTIL_LIVE');
    expect(src).not.toMatch(
      /STAY_LISTING_CONFIRMATION_NOTE\} \{BOOKING_CONFIRMATION_EMAIL_DISCLAIMER\}/
    );
    expect(src).not.toMatch(
      /\{STAY_LISTING_CONFIRMATION_NOTE\} Checkout uses/
    );
  });
});
