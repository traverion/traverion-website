import { describe, expect, it } from 'vitest';
import {
  bookingIsStayNight,
  bookingNeedsPickupCopy,
  listingPickupCopyIncomplete,
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
    const stayNotes = { check_out: null, special_requests: 'check_out: 2026-09-22' };
    const tour = { check_out: null, special_requests: 'Guest phone: +358' };
    expect(bookingIsStayNight(stayCol)).toBe(true);
    expect(bookingIsStayNight(stayNotes)).toBe(true);
    expect(bookingIsStayNight(tour)).toBe(false);
    expect(bookingNeedsPickupCopy(stayCol, '', '')).toBe(false);
    expect(bookingNeedsPickupCopy(tour, 'Meet', '')).toBe(true);
  });

  it('resolves pickup attention once booking pickup_time is set', () => {
    const tourThin = { check_out: null, special_requests: null, pickup_time: null };
    const tourTimed = { check_out: null, special_requests: null, pickup_time: '07:30:00' };
    expect(bookingNeedsPickupCopy(tourThin, 'Meet', '')).toBe(true);
    expect(bookingNeedsPickupCopy(tourTimed, 'Meet', '')).toBe(false);
    expect(bookingNeedsPickupCopy(tourTimed, '', '')).toBe(false);
  });

  it('aligns Bookings pickup attention with paid + listing copy truth', () => {
    const paidThin = {
      status: 'confirmed',
      payment_status: 'paid',
      check_out: null,
      special_requests: null,
      pickup_time: null,
    };
    const paidCompleteListing = { ...paidThin };
    const unpaidThin = { ...paidThin, payment_status: 'pending' };
    expect(partnerBookingHasPickupAttention(paidThin, 'Meet', '')).toBe(true);
    expect(
      partnerBookingHasPickupAttention(
        paidCompleteListing,
        'Hotel lobby, 07:30, look for the Traverion sign',
        'Van'
      )
    ).toBe(false);
    expect(partnerBookingHasPickupAttention(unpaidThin, 'Meet', '')).toBe(false);
  });

  it('resolves pickup copy from the booked option when present', () => {
    const opts = [
      {
        id: 'a',
        pickupPlace: 'Hotel lobby, 07:30, look for the Traverion sign',
        optionInfo: 'Small group',
        travelerStartInstructions: 'Van A — wait at the lobby door',
      },
      { id: 'b', pickupPlace: 'Meet', optionInfo: '' },
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
          booking_option_id: 'a',
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

  it('partner attention uses snapshot copy when live listing is thin', () => {
    const snap = {
      listingTitle: 'Tour',
      optionLabel: null,
      meetingPoint: 'Hotel lobby, 07:30, look for the Traverion sign',
      pickupInstructions: 'Van pickup confirmed at purchase',
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
