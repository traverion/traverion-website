import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1625: availability options modal empty state', () => {
  it('explains when no bookable options exist', () => {
    const src = readFileSync(resolve(__dirname, 'AvailabilityOptionsModal.tsx'), 'utf8');
    expect(src).toContain('Phase 1625');
    expect(src).toContain('No bookable options for this date and party');
    expect(src).toMatch(/options\.length === 0 \?/);
  });
});
