/**
 * Cancellation policy + Deposits & insurance creator polish.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RENTAL_CANCELLATION_PRESETS,
  RENTAL_CANCELLATION_REFUND_NOTE,
  isRentalCancellationPreset,
  rentalCancellationCustomerText,
} from '../../../lib/rental-cancellation';
import { clearRentalDepositAmounts } from '../../../lib/rental-details';

const here = dirname(fileURLToPath(import.meta.url));
const flowSrc = readFileSync(join(here, 'RentalOnboardingFlow.tsx'), 'utf8');

describe('rental cancellation and deposit polish', () => {
  it('uses readable cancellation cards with one refund note', () => {
    expect(flowSrc).toContain('rental-cancel-card');
    expect(flowSrc).toContain('rental-cancel-card--selected');
    expect(flowSrc).toContain('role="radiogroup"');
    expect(flowSrc).toContain('role="radio"');
    expect(flowSrc).toContain('rental-cancel-card__deadline');
    expect(flowSrc).toContain('RENTAL_CANCELLATION_REFUND_NOTE');

    for (const preset of RENTAL_CANCELLATION_PRESETS) {
      expect(preset.body).not.toMatch(/automatic rental refunds/i);
      expect(preset.deadline.length).toBeGreaterThan(0);
      expect(isRentalCancellationPreset(preset.id)).toBe(true);
    }

    const flexible = RENTAL_CANCELLATION_PRESETS.find((p) => p.id === 'flexible_24h')!;
    expect(flexible.deadline).toBe('24 hours');
    expect(rentalCancellationCustomerText('flexible_24h')).toContain(flexible.body);
    expect(rentalCancellationCustomerText('flexible_24h')).toContain(RENTAL_CANCELLATION_REFUND_NOTE);
    expect(RENTAL_CANCELLATION_REFUND_NOTE).toMatch(/not a guaranteed refund/i);
  });

  it('shows deposit and insurance fields only when enabled', () => {
    expect(flowSrc).toContain('rental-deposit-stage');
    expect(flowSrc).toContain('Deposits are handled by you, not Traverion');
    expect(flowSrc).toContain('const depositOn = rental.depositRequired === true');
    expect(flowSrc).toContain('const insuranceOn = rental.insuranceIncluded === true');
    expect(flowSrc).toMatch(/depositOn \? \([\s\S]*?Deposit amount/);
    expect(flowSrc).toMatch(/insuranceOn \? \([\s\S]*?Coverage/);
    expect(flowSrc).not.toContain('Traverion does not currently collect security deposits online');
    expect(clearRentalDepositAmounts()).toEqual({ depositRequired: false });
  });
});
