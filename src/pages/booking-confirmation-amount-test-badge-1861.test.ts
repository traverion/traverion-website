import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1861: confirmation amount vs TEST badge', () => {
  it('keeps money and TEST as separate siblings (not concatenated €89TEST)', () => {
    const src = readFileSync(resolve(__dirname, 'BookingConfirmationPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1861');
    expect(src).toContain('<span>{formatMoney(Number(booking.amount_paid), booking.currency)}</span>');
    expect(src).toMatch(/flex flex-wrap items-baseline gap-x-2/);
    expect(src).toContain("{' '}TEST");
    // Old pattern glued TEST into the display text node with only margin (no text gap).
    expect(src).not.toMatch(
      /formatMoney\(Number\(booking\.amount_paid\), booking\.currency\)\s*\n\s*\{isStripeTestCheckoutSession/
    );
  });
});
