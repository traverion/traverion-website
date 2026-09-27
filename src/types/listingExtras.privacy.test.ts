import { describe, expect, it } from 'vitest';
import { listingExtrasToDb, parseListingExtras, stripPublicStayCheckInAddress } from './listingExtras';

describe('stay checkInAddress privacy (Phase 1081)', () => {
  it('listingExtrasToDb omits checkInAddress from public stay JSON', () => {
    const payload = listingExtrasToDb({
      inventoryFamily: 'stay',
      stay: {
        propertyType: 'Cabin',
        checkInAddress: 'Kauppakatu 1, Rovaniemi',
        nightlyPriceUsd: 120,
      },
    });
    expect(payload).toBeTruthy();
    const stay = (payload as { stay: Record<string, unknown> }).stay;
    expect(stay.propertyType).toBe('Cabin');
    expect(stay.checkInAddress).toBeUndefined();
    expect(stay.nightlyPriceUsd).toBe(120);
  });

  it('stripPublicStayCheckInAddress removes leaked extras keys', () => {
    const parsed = parseListingExtras({
      inventoryFamily: 'stay',
      stay: { checkInAddress: 'Secret Road 9', checkInTime: '15:00' },
    });
    expect(parsed.stay?.checkInAddress).toBe('Secret Road 9');
    const stripped = stripPublicStayCheckInAddress(parsed);
    expect(stripped?.stay?.checkInAddress).toBeUndefined();
    expect(stripped?.stay?.checkInTime).toBe('15:00');
  });
});
