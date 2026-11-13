import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bookings = readFileSync(new URL('./supabase-bookings.ts', import.meta.url), 'utf8');
const messages = readFileSync(new URL('./supabase-booking-ops.ts', import.meta.url), 'utf8');
const home = readFileSync(new URL('../pages/supplier/SupplierDashboard.tsx', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../pages/supplier/SupplierUnifiedCalendar.tsx', import.meta.url), 'utf8');
const desk = readFileSync(new URL('../pages/supplier/SupplierBookings.tsx', import.meta.url), 'utf8');
const inbox = readFileSync(new URL('../pages/supplier/SupplierInbox.tsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../pages/supplier/SupplierPerformance.tsx', import.meta.url), 'utf8');
const earnings = readFileSync(new URL('../pages/supplier/SupplierEarnings.tsx', import.meta.url), 'utf8');

describe('partner booking reads stay bounded', () => {
  it('scopes service dates, created-at, and a hard limit, and income reads only money rows', () => {
    expect(bookings).toContain('check_out.gte.');
    expect(bookings).toContain('created_at.gte.');
    expect(bookings).toContain('query.limit(limit)');
    expect(bookings).toContain('bookingId');
    expect(earnings).toContain('fetchPartnerIncomeSummary');
    expect(earnings).toContain('fetchPartnerIncomeHistory');
    expect(earnings).not.toContain('fetchAllSupplierBookingDeskRows');
  });

  it('keeps home, calendar, bookings, inbox, and analytics off the unbounded list', () => {
    expect(home).toContain('fromDate: windowFrom');
    expect(home).toContain('createdSince: salesSince');
    expect(home).toContain('excludeServiceWindow: true');
    expect(calendar).toContain('fromDate: range.fromYmd');
    expect(calendar).toContain('toDate: range.toYmd');
    expect(desk).toContain('fetchSupplierBookingDeskPage');
    expect(desk).toContain('Export filtered bookings');
    expect(desk).toContain('Export all bookings');
    expect(inbox).toContain('limit: cap');
    expect(analytics).toContain('fetchPartnerAnalyticsDaily');
    expect(analytics).toContain('fetchPartnerAnalyticsDistributions');
    expect(analytics).not.toContain('limit: 500');
  });

  it('asks for one message per thread and still falls back to a newest-first read', () => {
    expect(messages).toContain("rpc('latest_booking_messages'");
    expect(messages).toContain(".limit(1)");
    expect(messages).toContain(".order('created_at', { ascending: false })");
    expect(inbox).not.toContain('fetchBookingMessages(b.id)');
    expect(home).not.toContain('fetchBookingMessages(b.id)');
  });
});
