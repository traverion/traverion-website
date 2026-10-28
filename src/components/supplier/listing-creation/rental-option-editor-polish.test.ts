import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitGrossByCommissionBps } from '../../../lib/commercial-money';
import { rentalCategoryConfig, rentalOptionVariantAttributes } from '../../../lib/rental-categories';
import { evaluateRentalAvailability } from '../../../lib/rental-availability';
import { RENTAL_OPTION_STEPS } from './RentalOptionEditor';

const src = readFileSync(new URL('./RentalOptionEditor.tsx', import.meta.url), 'utf8');

describe('rental option editor polish', () => {
  it('keeps the six-step journey', () => {
    expect(RENTAL_OPTION_STEPS).toEqual([
      'identity',
      'inventory',
      'duration-mode',
      'duration-limits',
      'pricing',
      'review',
    ]);
  });

  it('shows only category and item-type attribute keys and prunes stale specs', () => {
    expect(src).toContain('rentalOptionVariantAttributes');
    expect(src).toContain('pruneRentalVariantAttributes');
    expect(src).toContain('rentalOptionNameReady');
    expect(src).toContain('maxLength={65}');
    expect(rentalCategoryConfig('bikes')?.variantAttributeKeys.some((row) => row.key === 'kit')).toBe(false);
    expect(rentalCategoryConfig('cameras_electronics')?.variantAttributeKeys.some((row) => row.key === 'kit')).toBe(
      true,
    );
    expect(rentalOptionVariantAttributes('bikes', 'standard_bicycle').map((row) => row.key)).toEqual(['size']);
    expect(rentalOptionVariantAttributes('bikes', 'electric_bike').map((row) => row.key)).toEqual(['size', 'power']);
    expect(rentalOptionVariantAttributes('skis_snowboards', 'ski_boots').map((row) => row.key)).toEqual(['bootSize']);
    expect(rentalOptionVariantAttributes('skis_snowboards', 'skis').map((row) => row.key)).toEqual(['length']);
  });

  it('uses inventory quantity stepper and clarifies concurrent stock', () => {
    expect(src).toContain('RentalQuantityStepper');
    expect(src).toContain('Concurrent stock for this option');
    expect(src).toContain('What makes this option different?');
    expect(src).toContain('Team notes');
    expect(src).toContain('scrollRef');
    expect(src).toContain('Save draft');
    expect(src).toContain('Save option');
    expect(src).toContain('missingItems');
    expect(src).toContain('CheckCircle2');
  });

  it('keeps overlapping bookings and preparation buffer on one stock pool', () => {
    const occupied = {
      variantId: 'opt',
      quantity: 1,
      // Hold end already includes preparation buffer after return.
      interval: {
        startMs: Date.parse('2026-12-01T09:00:00Z'),
        endMs: Date.parse('2026-12-01T19:00:00Z'),
      },
    };

    const overlapping = evaluateRentalAvailability({
      variantId: 'opt',
      stock: 1,
      requestedQty: 1,
      pickupReturn: {
        startMs: Date.parse('2026-12-01T12:00:00Z'),
        endMs: Date.parse('2026-12-01T14:00:00Z'),
      },
      bufferMinutes: 60,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [occupied],
    });
    expect(overlapping.ok).toBe(false);

    const duringPrep = evaluateRentalAvailability({
      variantId: 'opt',
      stock: 1,
      requestedQty: 1,
      pickupReturn: {
        startMs: Date.parse('2026-12-01T18:30:00Z'),
        endMs: Date.parse('2026-12-01T20:00:00Z'),
      },
      bufferMinutes: 0,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [occupied],
    });
    expect(duringPrep.ok).toBe(false);

    const freeAfterPrep = evaluateRentalAvailability({
      variantId: 'opt',
      stock: 1,
      requestedQty: 1,
      pickupReturn: {
        startMs: Date.parse('2026-12-01T19:00:00Z'),
        endMs: Date.parse('2026-12-01T21:00:00Z'),
      },
      bufferMinutes: 60,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [occupied],
    });
    expect(freeAfterPrep.ok).toBe(true);
  });

  it('polishes rental type and duration limits with compact controls', () => {
    expect(src).toContain('rental-option-mode__card');
    expect(src).toContain('role="radiogroup"');
    expect(src).toContain('role="radio"');
    expect(src).toContain('RentalLimitStepper');
    expect(src).toContain('showHourLimits');
    expect(src).toContain('showDayLimits');
    expect(src).toContain('calendar days');
    expect(src).toContain('not rolling 24-hour');
    expect(src).toContain('Choose a rental type to continue');
    expect(src).toContain('Keep existing min/max when switching types');
  });

  it('keeps pricing inputs only and a compact grouped review', () => {
    expect(src).toContain('Set the rental price for this option.');
    expect(src).toContain('rental-option-pricing');
    expect(src).toContain('rental-option-money');
    expect(src).not.toContain('OptionRateEarnings');
    expect(src).not.toContain('You earn');
    expect(src).toContain('ReviewGroup');
    expect(src).toContain('Identity');
    expect(src).toContain('Inventory');
    expect(src).toContain('Rental duration');
    expect(src).toContain('Pricing');
    expect(src).toContain('savingRef');
    expect(src).toContain('Saving…');
    expect(src).toContain('effectiveVariantDurationMode');
    // Checkout commission math stays intact elsewhere.
    expect(splitGrossByCommissionBps(10000, 1500)).toEqual({
      grossMinor: 10000,
      commissionBps: 1500,
      commissionMinor: 1500,
      supplierMinor: 8500,
      platformMinor: 1500,
    });
  });
});
