import { describe, expect, it } from 'vitest';
import { guestFacingBookingNotes, parsePickupDraft, upsertPickupDraft } from './booking-notes';
import { travelerPickupAddressFromRecord } from './pickup-area';
import {
  bookingPickupOpsStatus,
  formatPickupPlannerDateHeading,
  groupDeparturesByDateKey,
  paginateDayGroups,
  pickupAttention,
  pickupDepartureKey,
  pickupStopKey,
  PICKUP_PLANNER_DAYS_PER_PAGE,
} from './pickup-planner';

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

  it('formats day headings and paginates by calendar days', () => {
    expect(formatPickupPlannerDateHeading('2026-10-21')).toMatch(/21/);
    expect(formatPickupPlannerDateHeading('2026-10-21')).toMatch(/October/);
    const days = groupDeparturesByDateKey([
      { id: 'a', date: '2026-10-21', rows: [{ id: '1', listing_id: 'l', booking_date: '2026-10-21' }] },
      { id: 'b', date: '2026-10-21', rows: [{ id: '2', listing_id: 'l', booking_date: '2026-10-21' }] },
      { id: 'c', date: '2026-10-22', rows: [{ id: '3', listing_id: 'l', booking_date: '2026-10-22' }] },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]!.departures).toHaveLength(2);
    const paged = paginateDayGroups(
      Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}` })),
      1
    );
    expect(PICKUP_PLANNER_DAYS_PER_PAGE).toBe(10);
    expect(paged.slice).toHaveLength(10);
    expect(paged.pageCount).toBe(2);
  });

  it('surfaces pickup and meeting operational statuses', () => {
    expect(
      bookingPickupOpsStatus({
        id: '1',
        listing_id: 'l',
        purchase_snapshot: { listingTitle: 'Lights', capturedAt: '2026-10-01', fulfillment: 'pickup' },
      })
    ).toBe('pickup_time_needed');
    expect(
      bookingPickupOpsStatus({
        id: '2',
        listing_id: 'l',
        pickup_time: '18:00:00',
        purchase_snapshot: { listingTitle: 'Lights', capturedAt: '2026-10-01', fulfillment: 'meeting_point' },
      })
    ).toBe('guests_notified');
  });
});
