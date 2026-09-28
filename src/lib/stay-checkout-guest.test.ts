import { describe, expect, it } from 'vitest';
import { resumeStayLeadGuestName, stayCheckoutLeadGuestNameReady, bookingLeadGuestNameReady } from './stay-checkout-guest';

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
