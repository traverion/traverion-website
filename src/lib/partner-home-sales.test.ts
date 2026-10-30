import { describe, expect, it } from 'vitest';
import { computePartnerHomeSales30d } from './partner-home-sales';

const nowMs = Date.parse('2026-10-30T12:00:00.000Z');

describe('Mission 03: Partner Home Sales (Past 30 days)', () => {
  it('sums customer gross across tour, stay, and rental paid bookings before commission', () => {
    const result = computePartnerHomeSales30d({
      nowMs,
      remainingGrossByBookingId: {
        tour1: 200,
        stay1: 450,
        rental1: 89,
      },
      bookings: [
        {
          id: 'tour1',
          created_at: '2026-10-20T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 200,
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          id: 'stay1',
          created_at: '2026-10-15T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 450,
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          id: 'rental1',
          created_at: '2026-10-25T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 89,
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
    });

    expect(result.bookings).toBe(3);
    expect(result.primary?.[0]).toBe('EUR');
    expect(result.primary?.[1].revenue).toBe(739);
    expect(result.subtitle).toBe('Past 30 days · 3 paid bookings');
    expect(result.label).toMatch(/739/);
  });

  it('excludes unpaid, failed, fully refunded, and refund-due cancels', () => {
    const result = computePartnerHomeSales30d({
      nowMs,
      remainingGrossByBookingId: {
        paid: 100,
      },
      bookings: [
        {
          id: 'paid',
          created_at: '2026-10-20T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 100,
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          id: 'pending',
          created_at: '2026-10-20T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 0,
          status: 'pending',
          payment_status: 'pending',
        },
        {
          id: 'failed',
          created_at: '2026-10-20T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 0,
          status: 'confirmed',
          payment_status: 'failed',
        },
        {
          id: 'refunded',
          created_at: '2026-10-20T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 80,
          status: 'confirmed',
          payment_status: 'refunded',
        },
        {
          id: 'refund_due',
          created_at: '2026-10-20T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 90,
          status: 'cancelled',
          payment_status: 'paid',
          refund_choice: 'full_refund',
        },
      ],
    });

    expect(result.bookings).toBe(1);
    expect(result.primary?.[1].revenue).toBe(100);
    expect(result.subtitle).toBe('Past 30 days · 1 paid booking');
  });

  it('uses remaining gross so partial refunds reduce sales (not supplier net)', () => {
    const result = computePartnerHomeSales30d({
      nowMs,
      remainingGrossByBookingId: {
        partial: 60,
      },
      bookings: [
        {
          id: 'partial',
          created_at: '2026-10-18T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 100,
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
    });

    expect(result.primary?.[1].revenue).toBe(60);
  });

  it('keeps no_refund paid cancels and ignores bookings older than 30 days', () => {
    const result = computePartnerHomeSales30d({
      nowMs,
      bookings: [
        {
          id: 'kept',
          created_at: '2026-10-10T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 150,
          status: 'cancelled',
          payment_status: 'paid',
          refund_choice: 'no_refund',
        },
        {
          id: 'old',
          created_at: '2026-09-01T10:00:00.000Z',
          currency: 'EUR',
          amount_paid: 999,
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
    });

    expect(result.bookings).toBe(1);
    expect(result.primary?.[1].revenue).toBe(150);
  });

  it('shows empty subtitle when there are no paid bookings in range', () => {
    const result = computePartnerHomeSales30d({ nowMs, bookings: [] });
    expect(result.label).toBe('—');
    expect(result.subtitle).toBe('Past 30 days · No paid bookings');
  });
});
