import { describe, expect, it } from 'vitest';
import {
  bookingIsStayNight,
  bookingNeedsPickupCopy,
  listingPickupCopyIncomplete,
  partnerBookingHasPickupAttention,
  resolveBookingPickupCopy,
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
      { id: 'a', pickupPlace: 'Hotel lobby, 07:30, look for the Traverion sign', optionInfo: 'Van A' },
      { id: 'b', pickupPlace: 'Meet', optionInfo: '' },
    ];
    const fromB = resolveBookingPickupCopy({
      bookingOptionId: 'b',
      listingMeetingPoint: opts[0]!.pickupPlace,
      listingPickupInstructions: opts[0]!.optionInfo,
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
        opts[0]!.optionInfo,
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
});
