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
});
