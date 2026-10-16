import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1616: confirmation Open Trips CTA', () => {
  it('uses Open Trips instead of Manage booking on confirmation CTAs', () => {
    const src = readFileSync(resolve(__dirname, 'BookingConfirmationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1616');
    expect(src).not.toContain('Manage booking');
    expect(src).toContain('View booking in Trips');
    expect(src).toContain("label: 'Open Trips'");
  });
});
