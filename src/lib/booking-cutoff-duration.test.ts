import { describe, expect, it } from 'vitest';
import { normalizeListingBookingOption } from '../types/listingExtras';
import {
  bookingCutoffExplanation,
  cutoffAmountOptions,
  cutoffSelectionFromHours,
  effectiveBookingCutoffHours,
  hoursFromCutoffSelection,
} from './booking-cutoff-duration';

describe('booking cutoff duration', () => {
  it('converts minutes, hours, and days into stored hours', () => {
    expect(hoursFromCutoffSelection('minutes', 15)).toBe(0.25);
    expect(hoursFromCutoffSelection('minutes', 60)).toBe(1);
    expect(hoursFromCutoffSelection('hours', 1)).toBe(1);
    expect(hoursFromCutoffSelection('hours', 24)).toBe(24);
    expect(hoursFromCutoffSelection('days', 1)).toBe(24);
    expect(hoursFromCutoffSelection('days', 7)).toBe(168);
    expect(hoursFromCutoffSelection('minutes', 5)).toBeCloseTo(5 / 60, 8);
  });

  it('reads preset values back in the unit that was saved', () => {
    expect(cutoffSelectionFromHours(0.25)).toEqual({ kind: 'preset', unit: 'minutes', amount: 15 });
    expect(cutoffSelectionFromHours(3)).toEqual({ kind: 'preset', unit: 'hours', amount: 3 });
    expect(cutoffSelectionFromHours(24)).toEqual({ kind: 'preset', unit: 'days', amount: 1 });
    expect(cutoffSelectionFromHours(48)).toEqual({ kind: 'preset', unit: 'days', amount: 2 });
    expect(cutoffSelectionFromHours(168)).toEqual({ kind: 'preset', unit: 'days', amount: 7 });
  });

  it('keeps a legacy hour count that is outside the new lists', () => {
    expect(cutoffSelectionFromHours(36)).toEqual({ kind: 'legacy', unit: 'hours', amount: 36, hours: 36 });
    expect(cutoffSelectionFromHours(163)).toMatchObject({ kind: 'legacy', unit: 'hours', amount: 163 });
    const amounts = cutoffAmountOptions('hours', 36);
    expect(amounts[0]).toEqual({ value: '36', label: '36 hours (saved)' });
    expect(amounts.some((option) => option.value === '2')).toBe(true);
    expect(bookingCutoffExplanation(36)).toBe('Bookings close 36 hours before departure.');
  });

  it('uses the listing default only when the option has no cutoff', () => {
    expect(effectiveBookingCutoffHours(undefined, 4)).toBe(4);
    expect(effectiveBookingCutoffHours(0, 4)).toBe(4);
    expect(effectiveBookingCutoffHours(0.5, 4)).toBe(0.5);
    expect(effectiveBookingCutoffHours(2, 0)).toBe(2);
  });

  it('round-trips a minute cutoff and a legacy hour count through the option record', () => {
    const minutes = normalizeListingBookingOption(
      {
        id: 'm',
        name: 'Meet',
        priceUsd: 10,
        duration: '2 hours',
        pickupPlace: 'Maakuntakatu 29',
        bookingCutoffHoursBeforeStart: 30 / 60,
      },
      'm'
    );
    expect(minutes.bookingCutoffHoursBeforeStart).toBe(0.5);
    const legacy = normalizeListingBookingOption(
      {
        id: 'l',
        name: 'Meet',
        priceUsd: 10,
        duration: '2 hours',
        pickupPlace: 'Maakuntakatu 29',
        bookingCutoffHoursBeforeStart: 36,
      },
      'l'
    );
    expect(legacy.bookingCutoffHoursBeforeStart).toBe(36);
  });

  it('explains the selected duration', () => {
    expect(bookingCutoffExplanation(15 / 60)).toBe('Bookings close 15 minutes before departure.');
    expect(bookingCutoffExplanation(2)).toBe('Bookings close 2 hours before departure.');
    expect(bookingCutoffExplanation(48)).toBe('Bookings close 2 days before departure.');
    expect(bookingCutoffExplanation(0)).toBe('Bookings stay open until departure.');
  });
});
