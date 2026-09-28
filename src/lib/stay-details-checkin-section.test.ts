import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('StayDetails Check-in section (Phase 1587)', () => {
  const src = readFileSync(join(here, '../pages/StayDetails.tsx'), 'utf8');

  it('keeps Trips email note off Check-in & check-out (panel/sticky only)', () => {
    expect(src).toContain('Phase 1587');
    expect(src).toMatch(
      /Phase 1587: only times \/ missing-time honesty here[\s\S]*stayCheckInOutMissingCopy/
    );
    // No STAY_LISTING_CONFIRMATION_NOTE list item under that heading block.
    expect(src).not.toMatch(
      /Check-in & check-out[\s\S]{0,500}<li>\{STAY_LISTING_CONFIRMATION_NOTE\}<\/li>/
    );
  });
});
