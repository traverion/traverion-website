import { describe, expect, it } from 'vitest';
import { PARTNER_PICKUP_CSV_HEADER, partnerPickupCsvValues } from './partner-pickup-csv';

describe('partner pickup CSV', () => {
  it('exports payment_label Paid for confirmed paid trips and Pending for unpaid holds', () => {
    expect(PARTNER_PICKUP_CSV_HEADER).toContain('payment_label');
    expect(PARTNER_PICKUP_CSV_HEADER).toContain('payment_status');
    const paid = partnerPickupCsvValues(
      {
        status: 'confirmed',
        payment_status: 'paid',
        amount_paid: 189,
        booking_date: '2026-09-11',
        booking_number: 5,
        guests: 2,
        guest_name: 'Guest',
      },
      'Aurora tour',
      '09:00',
      '08:30',
      'Hotel lobby',
      'Bring warm layers'
    );
    const labelIdx = PARTNER_PICKUP_CSV_HEADER.indexOf('payment_label');
    const payIdx = PARTNER_PICKUP_CSV_HEADER.indexOf('payment_status');
    expect(paid[labelIdx]).toBe('Paid');
    expect(paid[payIdx]).toBe('paid');

    const unpaid = partnerPickupCsvValues(
      {
        status: 'pending',
        payment_status: 'pending',
        amount_paid: 0,
        booking_date: '2026-09-12',
        guests: 1,
      },
      'Aurora tour',
      '',
      '',
      '',
      ''
    );
    expect(unpaid[labelIdx].toLowerCase()).not.toBe('paid');
    expect(unpaid[payIdx]).toBe('pending');
  });
});
