import { describe, expect, it } from 'vitest';
import { guestFacingBookingNotes, parsePickupDraft, upsertPickupDraft } from './booking-notes';
import { travelerPickupAddressFromRecord } from './pickup-area';
import { pickupAttention, pickupDepartureKey, pickupStopKey } from './pickup-planner';

describe('pickup planner grouping', () => {
  it('keeps the same product on different schedules apart', () => {
    const base = {
      id: 'a',
      listing_id: 'listing',
      booking_date: '2026-10-23',
      purchase_snapshot: { listingTitle: 'Lights', capturedAt: '2026-10-01T00:00:00Z', startTimeHm: '18:30', optionId: 'small', scheduleId: 'fri' },
    };
    const other = {
      ...base,
      id: 'b',
      purchase_snapshot: { ...base.purchase_snapshot, scheduleId: 'sat', startTimeHm: '20:00' },
    };
    expect(pickupDepartureKey(base)).not.toBe(pickupDepartureKey(other));
  });

  it('does not merge different hotels that share a name fragment', () => {
    expect(pickupStopKey({ placeId: 'hotel-a', address: 'Arctic City Hotel' })).not.toBe(
      pickupStopKey({ placeId: 'hotel-b', address: 'Arctic City Hotel Annex' })
    );
  });

  it('hides drafts from travelers and prefers a confirmed supplier address', () => {
    const notes = upsertPickupDraft('Guest phone: +358', {
      timeHm: '18:05',
      address: 'Draft Hotel',
      placeId: 'p1',
      lat: 66.5,
      lng: 25.7,
      instructions: 'Wait outside',
    });
    expect(guestFacingBookingNotes(notes)).toBe('Guest phone: +358');
    expect(parsePickupDraft(notes)?.address).toBe('Draft Hotel');
    expect(
      travelerPickupAddressFromRecord({
        snapshot: { travelerPickupAddress: 'Customer Hotel' },
        specialRequests: `${notes}\nsupplier_pickup_address: Confirmed Hotel`,
      })
    ).toBe('Confirmed Hotel');
  });

  it('flags a pickup booking with no location or time, and ignores meeting-point bookings', () => {
    const pickup = {
      id: '1',
      listing_id: 'l',
      purchase_snapshot: { listingTitle: 'Lights', capturedAt: '2026-10-01', fulfillment: 'pickup' as const },
    };
    expect(pickupAttention(pickup, null)).toEqual(['location', 'time']);
    expect(
      pickupAttention(
        {
          ...pickup,
          purchase_snapshot: { ...pickup.purchase_snapshot, fulfillment: 'meeting_point' as const },
        },
        null
      )
    ).toEqual([]);
  });
});
