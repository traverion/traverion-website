import { describe, expect, it } from 'vitest';
import { PARTNER_BOOKINGS_CSV_HEADER, partnerBookingCsvValues } from './partner-bookings-csv';

describe('partner bookings CSV', () => {
  it('exports payment_label Refund due for cancelled+paid, not raw refund_choice alone', () => {
    expect(PARTNER_BOOKINGS_CSV_HEADER).toContain('payment_label');
    expect(PARTNER_BOOKINGS_CSV_HEADER).toContain('payment_status');
    const values = partnerBookingCsvValues(
      {
        id: 'b19',
        listing_id: 'tour',
        booking_number: 19,
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 189,
        currency: 'EUR',
        refund_choice: 'full_refund',
        booking_date: '2026-11-04',
        guests: 1,
      },
      'Test tour',
      '',
      ''
    );
    const labelIdx = PARTNER_BOOKINGS_CSV_HEADER.indexOf('payment_label');
    const payIdx = PARTNER_BOOKINGS_CSV_HEADER.indexOf('payment_status');
    expect(values[labelIdx]).toBe('Refund due');
    expect(values[payIdx]).toBe('paid');
    expect(values[labelIdx]).not.toBe('full_refund');
  });

  it('exports stay inventory, check_out, nights and blanks pickup', () => {
    expect(PARTNER_BOOKINGS_CSV_HEADER).toContain('inventory');
    expect(PARTNER_BOOKINGS_CSV_HEADER).toContain('check_out');
    expect(PARTNER_BOOKINGS_CSV_HEADER).toContain('nights');
    const values = partnerBookingCsvValues(
      {
        id: 'stay1',
        listing_id: 'prop',
        booking_number: 7,
        status: 'confirmed',
        payment_status: 'paid',
        amount_paid: 420,
        currency: 'EUR',
        booking_date: '2026-11-10',
        check_out: '2026-11-13',
        guests: 2,
      },
      'Lake cabin',
      '15:00',
      '08:00',
      { inventory: 'stay', nights: 3 }
    );
    const invIdx = PARTNER_BOOKINGS_CSV_HEADER.indexOf('inventory');
    const outIdx = PARTNER_BOOKINGS_CSV_HEADER.indexOf('check_out');
    const nightsIdx = PARTNER_BOOKINGS_CSV_HEADER.indexOf('nights');
    const pickupIdx = PARTNER_BOOKINGS_CSV_HEADER.indexOf('pickup_time');
    expect(values[invIdx]).toBe('stay');
    expect(values[outIdx]).toBe('2026-11-13');
    expect(values[nightsIdx]).toBe('3');
    expect(values[pickupIdx]).toBe('');
  });

  it('defaults inventory to tour when no check_out and keeps pickup', () => {
    const values = partnerBookingCsvValues(
      {
        id: 't1',
        listing_id: 'tour',
        booking_number: 1,
        status: 'confirmed',
        payment_status: 'paid',
        amount_paid: 99,
        currency: 'EUR',
        booking_date: '2026-11-04',
        guests: 2,
      },
      'Fjord hike',
      '09:00',
      '08:30'
    );
    expect(values[PARTNER_BOOKINGS_CSV_HEADER.indexOf('inventory')]).toBe('tour');
    expect(values[PARTNER_BOOKINGS_CSV_HEADER.indexOf('pickup_time')]).toBe('08:30');
    expect(values[PARTNER_BOOKINGS_CSV_HEADER.indexOf('nights')]).toBe('');
  });
});
