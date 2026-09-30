import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1823: booking confirmation receipt polish', () => {
  it('defines tv-confirm-shell classes', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1823');
    expect(css).toContain('.tv-confirm-shell');
    expect(css).toContain('.tv-confirm-hero--good');
    expect(css).toContain('.tv-confirm-fact');
  });

  it('confirmation page uses receipt chrome and display amount', () => {
    const src = readFileSync(resolve(__dirname, '../pages/BookingConfirmationPage.tsx'), 'utf8');
    expect(src).toContain('tv-confirm-shell');
    expect(src).toContain('tv-confirm-fact');
    expect(src).toContain('font-display text-2xl font-semibold tabular-nums');
    expect(src).toContain('STRIPE_TEST_UNTIL_LIVE');
  });
});
