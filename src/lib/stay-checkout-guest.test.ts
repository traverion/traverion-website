import { describe, expect, it } from 'vitest';
import {
  resumeStayLeadGuestName,
  stayCheckoutLeadGuestNameReady,
  bookingLeadGuestNameReady,
  stayBookingColumnsForCheckoutUpdate,
} from './stay-checkout-guest';

describe('stayCheckoutLeadGuestNameReady', () => {
  it('requires at least two non-space characters for tours and stays', () => {
    expect(stayCheckoutLeadGuestNameReady('')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady(' A ')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady('Jo')).toBe(true);
    expect(bookingLeadGuestNameReady('Ada Lovelace')).toBe(true);
  });
});

describe('resumeStayLeadGuestName', () => {
  it('prefers the booking guest_name over a client rewrite on Pay now resume', () => {
    expect(
      resumeStayLeadGuestName({ bodyCustomerName: 'Alex Guest', bookingGuestName: 'Old Name' })
    ).toBe('Old Name');
    expect(resumeStayLeadGuestName({ bodyCustomerName: '', bookingGuestName: 'Stored Guest' })).toBe(
      'Stored Guest'
    );
    expect(resumeStayLeadGuestName({ bodyCustomerName: 'New Guest', bookingGuestName: '' })).toBe(
      'New Guest'
    );
    expect(resumeStayLeadGuestName({ bodyCustomerName: null, bookingGuestName: null })).toBe('');
  });
});

describe('stayBookingColumnsForCheckoutUpdate', () => {
  it('Phase 1541: returns check_out and nights for stay checkout', () => {
    expect(
      stayBookingColumnsForCheckoutUpdate({
        inventoryFamily: 'stay',
        bookingDate: '2026-12-01',
        checkoutDate: '2026-12-05',
        quoteNights: 4,
      })
    ).toEqual({ check_out: '2026-12-05', nights: 4 });
  });

  it('Phase 1541: computes nights from dates when quote nights missing', () => {
    expect(
      stayBookingColumnsForCheckoutUpdate({
        inventoryFamily: 'stay',
        bookingDate: '2026-12-01',
        checkoutDate: '2026-12-04',
        quoteNights: null,
      })
    ).toEqual({ check_out: '2026-12-04', nights: 3 });
  });

  it('Phase 1541: skips tours and invalid ranges', () => {
    expect(
      stayBookingColumnsForCheckoutUpdate({
        inventoryFamily: 'tour',
        bookingDate: '2026-12-01',
        checkoutDate: '2026-12-05',
        quoteNights: 4,
      })
    ).toBeNull();
    expect(
      stayBookingColumnsForCheckoutUpdate({
        inventoryFamily: 'stay',
        bookingDate: '2026-12-05',
        checkoutDate: '2026-12-01',
        quoteNights: 4,
      })
    ).toBeNull();
  });
});
