import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('StayDetails sticky disclaimer (Phase 1586)', () => {
  const src = readFileSync(join(here, '../pages/StayDetails.tsx'), 'utf8');

  it('does not duplicate BOOKING_CONFIRMATION_EMAIL_DISCLAIMER after STAY_LISTING (1585)', () => {
    expect(src).toContain('Phase 1586');
    expect(src).toMatch(
      /Phase 1586\/1594[\s\S]*\{STAY_LISTING_CONFIRMATION_NOTE\} Checkout uses \{STRIPE_TEST_UNTIL_LIVE\}\./
    );
    expect(src).not.toMatch(
      /STAY_LISTING_CONFIRMATION_NOTE\} \{BOOKING_CONFIRMATION_EMAIL_DISCLAIMER\}/
    );
  });
});
