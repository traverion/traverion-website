import { describe, expect, it } from 'vitest';
import {
  formatCommissionPercentLabel,
  resolvePartnerArrivalDisplay,
} from './partner-booking-logistics';

describe('partner-booking-logistics', () => {
  it('shows meeting point address and ignores inclusion-like instructions', () => {
    const display = resolvePartnerArrivalDisplay({
      purchaseSnapshot: {
        listingTitle: 'Aurora',
        optionLabel: 'Standard',
        meetingPoint: 'Ruokasenkatu 3, Rovaniemi',
        pickupInstructions: 'Juice and cookies',
        startTimeHm: '20:00',
        capturedAt: '2026-01-01T00:00:00.000Z',
        fulfillment: 'meeting_point',
        includes: ['Juice and cookies', 'Guide'],
      },
    });
    expect(display.rail).toBe('meeting_point');
    expect(display.railLabel).toBe('Meeting point');
    expect(display.place).toBe('Ruokasenkatu 3, Rovaniemi');
    expect(display.instructions).toBeNull();
  });

  it('shows accommodation pickup from traveler address', () => {
    const display = resolvePartnerArrivalDisplay({
      purchaseSnapshot: {
        listingTitle: 'Aurora',
        optionLabel: 'Pickup',
        meetingPoint: 'Pickup area centre',
        pickupInstructions: 'Wait at lobby',
        startTimeHm: '20:00',
        capturedAt: '2026-01-01T00:00:00.000Z',
        fulfillment: 'pickup',
        travelerPickupAddress: 'Santa Claus Village Hotel',
      },
    });
    expect(display.rail).toBe('pickup');
    expect(display.sectionLabel).toBe('Accommodation pickup');
    expect(display.place).toBe('Santa Claus Village Hotel');
    expect(display.instructions).toBe('Wait at lobby');
  });

  it('flags location needed when pickup has no address', () => {
    const display = resolvePartnerArrivalDisplay({
      purchaseSnapshot: {
        listingTitle: 'Aurora',
        optionLabel: 'Pickup',
        meetingPoint: null,
        pickupInstructions: null,
        startTimeHm: '20:00',
        capturedAt: '2026-01-01T00:00:00.000Z',
        fulfillment: 'pickup',
      },
    });
    expect(display.rail).toBe('location_needed');
    expect(display.needsLocation).toBe(true);
  });

  it('formats commission bps as a percent label', () => {
    expect(formatCommissionPercentLabel(1500)).toBe('15%');
    expect(formatCommissionPercentLabel(1250)).toBe('12.5%');
  });
});
