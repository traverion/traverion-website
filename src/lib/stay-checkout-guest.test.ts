import { describe, expect, it } from 'vitest';
import { resumeStayLeadGuestName, stayCheckoutLeadGuestNameReady } from './stay-checkout-guest';

describe('stayCheckoutLeadGuestNameReady', () => {
  it('requires at least two non-space characters', () => {
    expect(stayCheckoutLeadGuestNameReady('')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady(' A ')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady('Jo')).toBe(true);
  });
});

describe('resumeStayLeadGuestName', () => {
  it('prefers the client name, then the booking guest_name', () => {
    expect(
      resumeStayLeadGuestName({ bodyCustomerName: 'Alex Guest', bookingGuestName: 'Old Name' })
    ).toBe('Alex Guest');
    expect(resumeStayLeadGuestName({ bodyCustomerName: '', bookingGuestName: 'Stored Guest' })).toBe(
      'Stored Guest'
    );
    expect(resumeStayLeadGuestName({ bodyCustomerName: null, bookingGuestName: null })).toBe('');
  });
});
