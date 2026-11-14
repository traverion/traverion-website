import { describe, expect, it } from 'vitest';
import {
  bookingIsRental,
  bookingIsStayNight,
  bookingNeedsPickupCopy,
  bookingProductNoun,
  listingPickupCopyIncomplete,
  partnerBookingDeskFamily,
  partnerBookingHasPickupAttention,
  resolveBookingPickupCopy,
  resolvePartnerPickupCopy,
} from './pickup-completeness';

describe('pickup completeness', () => {
  it('treats thin listing copy as incomplete for tours', () => {
    expect(listingPickupCopyIncomplete('Meet', '')).toBe(true);
    expect(listingPickupCopyIncomplete('Hotel lobby, 07:30, look for the Traverion sign', 'Van')).toBe(
      false
    );
  });

  it('does not treat stay nights as pickup work', () => {
    const stayCol = { check_out: '2026-09-22', special_requests: null };
    const stayNotesOnly = { check_out: null, special_requests: 'check_out: 2026-09-22' };
    const staySnap = {
      check_out: null,
      special_requests: null,
      purchase_snapshot: { checkOut: '2026-09-22' },
    };
    const stayNightsOnly = { check_out: null, special_requests: null, nights: 3 };
    const tour = { check_out: null, special_requests: 'Guest phone: +358' };
    expect(bookingIsStayNight(stayCol)).toBe(true);
    // Phase 1523: notes-only check_out: must not flip tour→stay
    expect(bookingIsStayNight(stayNotesOnly)).toBe(false);
    expect(bookingIsStayNight(staySnap)).toBe(true);
    expect(bookingIsStayNight(stayNightsOnly)).toBe(true);
    expect(bookingIsStayNight({ ...tour, nights: 0 })).toBe(false);
    expect(bookingIsStayNight(tour)).toBe(false);
    const rentalWithReturnDay = {
      check_out: '2030-01-05',
      nights: 2,
      purchase_snapshot: { inventoryFamily: 'rental', checkOut: '2030-01-05' },
    };
    expect(bookingIsRental(rentalWithReturnDay)).toBe(true);
    expect(bookingIsStayNight(rentalWithReturnDay)).toBe(false);
    expect(bookingProductNoun(rentalWithReturnDay)).toBe('Rental');
    expect(bookingProductNoun(stayCol)).toBe('Stay');
    expect(bookingProductNoun(tour)).toBe('Tour');
    expect(bookingNeedsPickupCopy(stayCol, '', '')).toBe(false);
    expect(bookingNeedsPickupCopy(stayNightsOnly, 'Meet', '')).toBe(false);
    expect(bookingNeedsPickupCopy(tour, 'Meet', '')).toBe(true);
    // Rentals with collection address must never enter tour pickup attention.
    expect(bookingNeedsPickupCopy(rentalWithReturnDay, '', '')).toBe(false);
    expect(bookingNeedsPickupCopy(rentalWithReturnDay, 'Meet', '')).toBe(false);
    expect(partnerBookingDeskFamily(rentalWithReturnDay)).toBe('rental');
    expect(partnerBookingDeskFamily(stayCol)).toBe('stay');
    expect(partnerBookingDeskFamily(tour)).toBe('tour');
    expect(
      partnerBookingHasPickupAttention(
        {
          status: 'confirmed',
          payment_status: 'paid',
          check_out: '2030-01-05',
          purchase_snapshot: {
            inventoryFamily: 'rental',
            pickupAddress: 'Studio desk, Helsinki',
          },
        },
        '',
        ''
      )
    ).toBe(false);
  });

  it('resolves pickup attention once booking pickup_time is set', () => {
    const tourThin = { check_out: null, special_requests: null, pickup_time: null };
    const tourTimed = { check_out: null, special_requests: null, pickup_time: '07:30:00' };
    expect(bookingNeedsPickupCopy(tourThin, 'Meet', '')).toBe(true);
    expect(bookingNeedsPickupCopy(tourTimed, 'Meet', '')).toBe(false);
    expect(bookingNeedsPickupCopy(tourTimed, '', '')).toBe(false);
  });

  it('flags paid pickup fulfillment only when traveler address is missing', () => {
    const paidMissing = {
      status: 'confirmed',
      payment_status: 'paid',
      check_out: null,
      special_requests: null,
      pickup_time: null,
      purchase_snapshot: {
        listingTitle: 'Tour',
        capturedAt: '2026-01-01T00:00:00.000Z',
        fulfillment: 'pickup',
      },
    };
    const paidWithAddress = {
      ...paidMissing,
      purchase_snapshot: {
        ...paidMissing.purchase_snapshot,
        travelerPickupAddress: 'Arctic City Hotel',
      },
    };
    const meetingPointOnly = {
      ...paidMissing,
      purchase_snapshot: {
        listingTitle: 'Tour',
        capturedAt: '2026-01-01T00:00:00.000Z',
        fulfillment: 'meeting_point',
        meetingPoint: 'Meet',
      },
    };
    const unpaid = { ...paidMissing, payment_status: 'pending' };
    expect(partnerBookingHasPickupAttention(paidMissing, 'Meet', '')).toBe(true);
    expect(partnerBookingHasPickupAttention(paidWithAddress, 'Meet', '')).toBe(false);
    expect(partnerBookingHasPickupAttention(meetingPointOnly, 'Meet', '')).toBe(false);
    expect(partnerBookingHasPickupAttention(unpaid, 'Meet', '')).toBe(false);
  });

  it('resolves pickup copy from the booked option when present', () => {
    const opts = [
      {
        id: 'a',
        fulfillment: 'pickup' as const,
        pickupPlace: 'Hotel lobby, 07:30, look for the Traverion sign',
        optionInfo: 'Small group',
        travelerStartInstructions: 'Van A — wait at the lobby door',
      },
      { id: 'b', fulfillment: 'pickup' as const, pickupPlace: 'Meet', optionInfo: '' },
      { id: 'm', fulfillment: 'meeting_point' as const, pickupPlace: 'Square', optionInfo: '' },
    ];
    const fromB = resolveBookingPickupCopy({
      bookingOptionId: 'b',
      listingMeetingPoint: opts[0]!.pickupPlace,
      listingPickupInstructions: 'Van',
      bookingOptions: opts,
    });
    expect(fromB.meetingPoint).toBe('Meet');
    expect(
      partnerBookingHasPickupAttention(
        {
          status: 'confirmed',
          payment_status: 'paid',
          pickup_time: null,
          booking_option_id: 'b',
        },
        opts[0]!.pickupPlace,
        'Van',
        opts
      )
    ).toBe(true);
    expect(
      partnerBookingHasPickupAttention(
        {
          status: 'confirmed',
          payment_status: 'paid',
          pickup_time: null,
          booking_option_id: 'm',
        },
        'Meet',
        '',
        opts
      )
    ).toBe(false);
    expect(
      partnerBookingHasPickupAttention(
        {
          status: 'confirmed',
          payment_status: 'paid',
          pickup_time: null,
          booking_option_id: 'a',
          purchase_snapshot: {
            listingTitle: 'Tour',
            capturedAt: '2026-01-01T00:00:00.000Z',
            fulfillment: 'pickup',
            travelerPickupAddress: 'Arctic City Hotel',
          },
        },
        'Meet',
        '',
        opts
      )
    ).toBe(false);
  });

  it('prefers travelerStartInstructions over optionInfo for partner pickup copy', () => {
    const resolved = resolveBookingPickupCopy({
      bookingOptionId: 'a',
      listingMeetingPoint: 'Listing meet',
      listingPickupInstructions: 'Listing note',
      bookingOptions: [
        {
          id: 'a',
          pickupPlace: 'Arctic City Hotel',
          optionInfo: 'Includes hotel pickup',
          travelerStartInstructions: 'Wait outside the main entrance 10 minutes early.',
        },
      ],
    });
    expect(resolved.meetingPoint).toBe('Arctic City Hotel');
    expect(resolved.pickupInstructions).toBe('Wait outside the main entrance 10 minutes early.');
  });

  it('prefers per-booking note overrides over option and listing copy', () => {
    const opts = [
      {
        id: 'a',
        pickupPlace: 'Hotel lobby, 07:30, look for the Traverion sign',
        optionInfo: 'Small group',
        travelerStartInstructions: 'Van A — wait at the lobby door',
      },
    ];
    const notes = 'meeting_point: Private villa gate\npickup_instructions: Call +358 on arrival for the guide';
    const resolved = resolveBookingPickupCopy({
      bookingOptionId: 'a',
      specialRequests: notes,
      listingMeetingPoint: 'Meet',
      listingPickupInstructions: '',
      bookingOptions: opts,
    });
    expect(resolved.meetingPoint).toBe('Private villa gate');
    expect(resolved.pickupInstructions).toBe('Call +358 on arrival for the guide');
    expect(
      partnerBookingHasPickupAttention(
        {
          status: 'confirmed',
          payment_status: 'paid',
          pickup_time: null,
          booking_option_id: 'a',
          special_requests: notes,
          purchase_snapshot: {
            listingTitle: 'Tour',
            capturedAt: '2026-01-01T00:00:00.000Z',
            fulfillment: 'meeting_point',
          },
        },
        'Meet',
        '',
        opts
      )
    ).toBe(false);
  });

  it('prefers purchase snapshot logistics over live listing for partner pickup (Phase 1083)', () => {
    const snap = {
      listingTitle: 'Northern Lights Tour',
      optionLabel: null,
      meetingPoint: 'Purchased meeting: Arctic City Hotel lobby',
      pickupInstructions: 'Purchased: wait at lobby door for van A',
      startTimeHm: '20:00',
      capturedAt: '2026-01-01T00:00:00.000Z',
    };
    const resolved = resolvePartnerPickupCopy({
      purchaseSnapshot: snap,
      listingMeetingPoint: 'LIVE meet (edited after purchase)',
      listingPickupInstructions: 'LIVE pickup (edited)',
      bookingOptions: [
        {
          id: 'opt-1',
          pickupPlace: 'LIVE option place',
          travelerStartInstructions: 'LIVE option instructions',
        },
      ],
      bookingOptionId: 'opt-1',
    });
    expect(resolved.meetingPoint).toBe('Purchased meeting: Arctic City Hotel lobby');
    expect(resolved.pickupInstructions).toBe('Purchased: wait at lobby door for van A');
  });

  it('does not resurrect live listing pickup when snapshot left logistics blank', () => {
    const snap = {
      listingTitle: 'Tour',
      optionLabel: null,
      meetingPoint: null,
      pickupInstructions: null,
      startTimeHm: null,
      capturedAt: '2026-01-01T00:00:00.000Z',
    };
    const resolved = resolvePartnerPickupCopy({
      purchaseSnapshot: snap,
      listingMeetingPoint: 'Should not appear',
      listingPickupInstructions: 'Should not appear either',
      bookingOptions: [{ id: 'a', pickupPlace: 'Also live' }],
      bookingOptionId: 'a',
    });
    expect(resolved.meetingPoint).toBe('');
    expect(resolved.pickupInstructions).toBe('');
  });

  it('partner attention ignores thin listing copy when traveler pickup is set', () => {
    const snap = {
      listingTitle: 'Tour',
      optionLabel: null,
      fulfillment: 'pickup' as const,
      meetingPoint: 'Hotel lobby, 07:30, look for the Traverion sign',
      pickupInstructions: 'Van pickup confirmed at purchase',
      travelerPickupAddress: 'Arctic City Hotel',
      startTimeHm: '07:30',
      capturedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(
      partnerBookingHasPickupAttention(
        {
          status: 'confirmed',
          payment_status: 'paid',
          pickup_time: null,
          purchase_snapshot: snap,
          special_requests: null,
        },
        'Meet',
        '',
        null
      )
    ).toBe(false);
  });
});
