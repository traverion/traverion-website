import { describe, expect, it } from 'vitest';
import {
  rentalCancellationCustomerText,
  rentalCancellationShortSummary,
} from './rental-cancellation';
import { rentalDepositShortSummary } from './rental-presentation';
import type { RentalDetails } from '../types/rental';

describe('rental checkout short disclosures', () => {
  it('keeps short summary briefer than full cancellation text', () => {
    const short = rentalCancellationShortSummary('flexible_24h');
    const full = rentalCancellationCustomerText('flexible_24h');
    expect(short).toMatch(/Flexible/);
    expect(short).toMatch(/24 hours/);
    expect(short.length).toBeLessThan(full.length);
    expect(full).toContain('Traverion does not issue automatic rental refunds');
  });

  it('summarizes deposit without inventing amounts', () => {
    const none = rentalDepositShortSummary({
      depositRequired: false,
    } as RentalDetails);
    expect(none).toMatch(/No security deposit/i);

    const withAmount = rentalDepositShortSummary({
      depositRequired: true,
      depositAmountMinor: 25_000,
    } as RentalDetails);
    expect(withAmount).toMatch(/€250/);
    expect(withAmount).toMatch(/operator/i);
  });
});
