import { describe, expect, it } from 'vitest';
import {
  listingExtrasToDb,
  parseListingExtras,
  stripPublicBookingContactPhone,
  stripPublicStayCheckInAddress,
} from './listingExtras';

describe('stay checkInAddress privacy (Phase 1081)', () => {
  it('listingExtrasToDb omits checkInAddress from public stay JSON', () => {
    const payload = listingExtrasToDb({
      inventoryFamily: 'stay',
      stay: {
        propertyType: 'Cabin',
        checkInAddress: 'Kauppakatu 1, Rovaniemi',
        locationDisplayName: 'Aurora Villa',
        accommodationMode: 'multi',
        units: [{ id: 'room-1', name: 'Standard Room', maxGuests: 2, nightlyPriceUsd: 120, quantity: 10 }],
        nightlyPriceUsd: 120,
      },
    });
    expect(payload).toBeTruthy();
    const stay = (payload as { stay: Record<string, unknown> }).stay;
    expect(stay.propertyType).toBe('Cabin');
    expect(stay.checkInAddress).toBeUndefined();
    expect(stay.locationDisplayName).toBe('Aurora Villa');
    expect(stay.accommodationMode).toBe('multi');
    expect(Array.isArray(stay.units)).toBe(true);
    expect(stay.nightlyPriceUsd).toBe(120);
  });

  it('stripPublicStayCheckInAddress removes leaked extras keys', () => {
    const parsed = parseListingExtras({
      inventoryFamily: 'stay',
      stay: {
        checkInAddress: 'Secret Road 9',
        checkInTime: '15:00',
        locationDisplayName: 'Aurora Villa',
      },
    });
    expect(parsed.stay?.checkInAddress).toBe('Secret Road 9');
    expect(parsed.stay?.locationDisplayName).toBe('Aurora Villa');
    const stripped = stripPublicStayCheckInAddress(parsed);
    expect(stripped?.stay?.checkInAddress).toBeUndefined();
    expect(stripped?.stay?.checkInTime).toBe('15:00');
  });
});

describe('booking contact privacy', () => {
  it('listingExtrasToDb never writes bookingContactPhoneE164 into public JSON', () => {
    const payload = listingExtrasToDb({
      knowBeforeYouGo: 'Dress warmly',
      bookingContactPhoneE164: '+358401234567',
      whatToBringIds: ['gloves'],
    });
    expect(payload).toBeTruthy();
    expect((payload as Record<string, unknown>).bookingContactPhoneE164).toBeUndefined();
    expect((payload as Record<string, unknown>).knowBeforeYouGo).toBe('Dress warmly');
    expect((payload as Record<string, unknown>).whatToBringIds).toEqual(['gloves']);
  });

  it('stripPublicBookingContactPhone removes leaked extras keys', () => {
    const parsed = parseListingExtras({
      bookingContactPhoneE164: '+358401234567',
      additionalInfo: 'Bring cash',
    });
    expect(parsed.bookingContactPhoneE164).toBe('+358401234567');
    const stripped = stripPublicBookingContactPhone(parsed);
    expect(stripped?.bookingContactPhoneE164).toBeUndefined();
    expect(stripped?.additionalInfo).toBe('Bring cash');
  });
});
