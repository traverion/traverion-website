import { describe, expect, it } from 'vitest';
import {
  travelerLeadGuestNameFromAuth,
  travelerLeadGuestPhoneFromAuth,
} from './traveler-checkout-autofill';

describe('travelerCheckoutAutofill', () => {
  it('prefers consumer profile over auth metadata', () => {
    expect(
      travelerLeadGuestNameFromAuth({
        consumerDisplayName: 'Anna Traveler',
        metadata: {
          customer_first_name: 'Ignored',
          display_name: 'Aurora Lapland Oy',
          supplier_business_name: 'Aurora Lapland Oy',
        },
      })
    ).toBe('Anna Traveler');
  });

  it('uses customer_* metadata only — ignores business/display names', () => {
    expect(
      travelerLeadGuestNameFromAuth({
        consumerDisplayName: '',
        metadata: {
          display_name: 'Aurora Lapland Oy',
          full_name: 'Aurora Lapland Oy',
          name: 'Aurora Lapland Oy',
          supplier_business_name: 'Aurora Lapland Oy',
          customer_first_name: 'Miro',
          customer_last_name: 'Vesterinen',
        },
      })
    ).toBe('Miro Vesterinen');
  });

  it('returns empty when only business metadata is present (partner session bleed)', () => {
    expect(
      travelerLeadGuestNameFromAuth({
        consumerDisplayName: null,
        metadata: {
          display_name: 'Aurora Lapland Oy',
          full_name: 'Aurora Lapland Oy',
          supplier_business_name: 'Aurora Lapland Oy',
        },
      })
    ).toBe('');
  });

  it('phones prefer consumer profile then customer_phone', () => {
    expect(
      travelerLeadGuestPhoneFromAuth({
        consumerPhone: '+358401111111',
        metadata: { phone: '+358409999999', customer_phone: '+358402222222' },
      })
    ).toBe('+358401111111');
    expect(
      travelerLeadGuestPhoneFromAuth({
        consumerPhone: '',
        metadata: { phone: '+358409999999', customer_phone: '+358402222222' },
      })
    ).toBe('+358402222222');
  });
});
