import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildPartnerUnifiedCalendarEvents,
  filterPartnerUnifiedCalendarEvents,
  formatPartnerUnifiedMonthLabel,
  groupPartnerUnifiedEventsByDate,
  formatPartnerUnifiedWeekLabel,
  parsePartnerUnifiedCalendarView,
  partnerUnifiedApplyShift,
  partnerUnifiedApplyViewChange,
  partnerUnifiedDisplayRangeForView,
  partnerUnifiedFocusInRange,
  partnerUnifiedMonthRangeContaining,
  partnerUnifiedSharedFocusYmd,
  partnerUnifiedShiftFocusByMonths,
  partnerUnifiedShiftFocusByWeeks,
  partnerUnifiedShiftMonth,
  partnerUnifiedShiftWeek,
  partnerUnifiedWeekRangeContaining,
  parsePartnerUnifiedCategoryFilter,
  partnerUnifiedEventIsUpcomingOrOngoing,
  partnerUnifiedNormalizeRange,
  partnerUnifiedRollingRange,
  partnerUnifiedShiftRange,
  partnerUnifiedWeeksCoveringRange,
  summarizePartnerUnifiedMonthDays,
} from './partner-unified-calendar';

function tourBooking(params: {
  id?: string;
  listing_id?: string;
  booking_date: string;
  guests?: number;
  start_time?: string;
  optionLabel?: string;
}) {
  return {
    id: params.id ?? 't1',
    listing_id: params.listing_id ?? 'listing-tour',
    status: 'confirmed',
    payment_status: 'paid',
    guest_name: 'Tour Guest',
    guests: params.guests ?? 2,
    booking_date: params.booking_date,
    start_time: params.start_time ?? '10:00:00',
    public_reference: 'TV-TOUR0001',
    purchase_snapshot: {
      listingTitle: 'Northern Lights',
      optionLabel: params.optionLabel ?? 'Standard',
      startTimeHm: '10:00',
      departureTimezone: 'Europe/Helsinki',
    },
  };
}

function stayBooking(params: {
  id?: string;
  listing_id?: string;
  checkIn: string;
  checkOut: string;
}) {
  return {
    id: params.id ?? 's1',
    listing_id: params.listing_id ?? 'listing-stay',
    status: 'confirmed',
    payment_status: 'paid',
    guest_name: 'Stay Guest',
    guests: 3,
    booking_date: params.checkIn,
    check_out: params.checkOut,
    nights: 2,
    public_reference: 'TV-STAY0001',
    purchase_snapshot: {
      listingTitle: 'Lapland Cabin',
      departureTimezone: 'Europe/Helsinki',
    },
  };
}

function rentalBooking(params: {
  id?: string;
  listing_id?: string;
  pickupAt: string;
  returnAt: string;
  quantity?: number;
}) {
  return {
    id: params.id ?? 'r1',
    listing_id: params.listing_id ?? 'listing-rental',
    status: 'confirmed',
    payment_status: 'paid',
    guest_name: 'Rental Guest',
    guests: params.quantity ?? 1,
    booking_date: params.pickupAt.slice(0, 10),
    check_out: params.returnAt.slice(0, 10),
    public_reference: 'TV-RENT0001',
    purchase_snapshot: {
      inventoryFamily: 'rental',
      variantId: 'v1',
      variantName: 'Sony A7 IV',
      quantity: params.quantity ?? 1,
      pickupAt: params.pickupAt,
      returnAt: params.returnAt,
      durationCount: 1,
      durationUnit: 'day' as const,
      unitMinor: 8900,
      customerTotalMinor: 8900,
      commissionMinor: 1335,
      supplierEarningsMinor: 7565,
      commissionBps: 1500,
      discountApplied: false,
      currency: 'EUR',
      rentalOpsStatus: 'awaiting_pickup' as const,
      departureTimezone: 'Europe/Helsinki',
      listingTitle: 'Camera Kit',
    },
  };
}

describe('partner-unified-calendar', () => {
  it('wires Week view into SupplierUnifiedCalendar', () => {
    const page = readFileSync(resolve(__dirname, '../pages/supplier/SupplierUnifiedCalendar.tsx'), 'utf8');
    const week = readFileSync(
      resolve(__dirname, '../components/supplier/PartnerUnifiedWeekView.tsx'),
      'utf8'
    );
    expect(page).toContain("selectView('week')");
    expect(page).toContain('PartnerUnifiedWeekView');
    expect(page).toContain('partnerUnifiedDisplayRangeForView');
    expect(week).toContain('WEEK_TILE_LIMIT');
    expect(week).toContain('PartnerUnifiedEventEditPopover');
    const popover = readFileSync(
      resolve(__dirname, '../components/supplier/PartnerUnifiedEventEditPopover.tsx'),
      'utf8'
    );
    expect(popover).toContain('Open booking');
    expect(popover).toContain('computeAnchoredPopoverBox');
  });

  it('wires stay/rental presence overlays for zero-booking listings', () => {
    const page = readFileSync(resolve(__dirname, '../pages/supplier/SupplierUnifiedCalendar.tsx'), 'utf8');
    expect(page).toContain('buildPartnerUnifiedStayPresenceEvents');
    expect(page).toContain('buildPartnerUnifiedRentalPresenceEvents');
    expect(page).toContain('stayListingsInScope');
    expect(page).toContain('rentalListingsInScope');
    expect(page).toContain('stayListingIdsKey');
    expect(page).toContain('rentalListingIdsKey');
  });

  it('defaults view to agenda and category to all', () => {
    expect(parsePartnerUnifiedCalendarView(null)).toBe('agenda');
    expect(parsePartnerUnifiedCalendarView('week')).toBe('week');
    expect(parsePartnerUnifiedCalendarView('month')).toBe('month');
    expect(parsePartnerUnifiedCategoryFilter('rentals')).toBe('all');
    expect(parsePartnerUnifiedCategoryFilter('rental')).toBe('rental');
  });

  it('snaps week ranges to Monday–Sunday and shifts by weeks', () => {
    // 2026-11-04 is Wednesday
    expect(partnerUnifiedWeekRangeContaining('2026-11-04')).toEqual({
      fromYmd: '2026-11-02',
      toYmd: '2026-11-08',
    });
    expect(partnerUnifiedShiftWeek('2026-11-02', 1)).toEqual({
      fromYmd: '2026-11-09',
      toYmd: '2026-11-15',
    });
    expect(partnerUnifiedShiftWeek('2026-11-02', -1)).toEqual({
      fromYmd: '2026-10-26',
      toYmd: '2026-11-01',
    });
    expect(formatPartnerUnifiedWeekLabel('2026-11-02', '2026-11-08')).toMatch(/2.*8.*Nov.*2026/i);
  });

  it('Month ignores week from/to query params and expands to the full calendar month', () => {
    // Exact failing URL: ?view=month&from=2026-11-02&to=2026-11-08&day=2026-11-05
    const focus = '2026-11-05';
    const weekFrom = '2026-11-02';
    const weekTo = '2026-11-08';
    const month = partnerUnifiedDisplayRangeForView({
      view: 'month',
      focusYmd: focus,
      fromYmd: weekFrom,
      toYmd: weekTo,
    });
    expect(month).toEqual({ fromYmd: '2026-11-01', toYmd: '2026-11-30' });
    expect(partnerUnifiedMonthRangeContaining(focus)).toEqual(month);
    expect(formatPartnerUnifiedMonthLabel(month.fromYmd)).toMatch(/November 2026/i);

    const cells = partnerUnifiedWeeksCoveringRange(month.fromYmd, month.toYmd);
    const inRange = cells.filter((c) => c.inRange);
    expect(inRange[0]?.iso).toBe('2026-11-01');
    expect(inRange[inRange.length - 1]?.iso).toBe('2026-11-30');
    expect(inRange).toHaveLength(30);
    // Padded adjacent-month days stay out of range so the grid still renders a full month.
    expect(cells.some((c) => !c.inRange)).toBe(true);
    expect(cells.some((c) => c.iso === '2026-11-02' && c.inRange)).toBe(true);
    expect(cells.some((c) => c.iso === '2026-11-08' && c.inRange)).toBe(true);

    // Week → Month → Week → Month must keep re-deriving independently from focus.
    const afterWeek = partnerUnifiedDisplayRangeForView({
      view: 'week',
      focusYmd: focus,
      fromYmd: month.fromYmd,
      toYmd: month.toYmd,
    });
    expect(afterWeek).toEqual({ fromYmd: '2026-11-02', toYmd: '2026-11-08' });
    expect(
      partnerUnifiedDisplayRangeForView({
        view: 'month',
        focusYmd: focus,
        fromYmd: afterWeek.fromYmd,
        toYmd: afterWeek.toYmd,
      })
    ).toEqual({ fromYmd: '2026-11-01', toYmd: '2026-11-30' });

    expect(partnerUnifiedShiftMonth('2026-11-01', 1)).toEqual({
      fromYmd: '2026-12-01',
      toYmd: '2026-12-31',
    });
    expect(partnerUnifiedShiftMonth('2026-11-01', -1)).toEqual({
      fromYmd: '2026-10-01',
      toYmd: '2026-10-31',
    });

    // Agenda keeps an explicit custom range; Week/Month never inherit it as a clipped window.
    expect(
      partnerUnifiedDisplayRangeForView({
        view: 'agenda',
        focusYmd: focus,
        fromYmd: weekFrom,
        toYmd: weekTo,
      })
    ).toEqual({ fromYmd: weekFrom, toYmd: weekTo });

    const page = readFileSync(resolve(__dirname, '../pages/supplier/SupplierUnifiedCalendar.tsx'), 'utf8');
    expect(page).toContain('partnerUnifiedDisplayRangeForView');
    expect(page).toContain('formatPartnerUnifiedMonthLabel');
    expect(page).toContain('partnerUnifiedApplyViewChange');
    expect(page).toContain('partnerUnifiedApplyShift');
    expect(page).toContain('partnerUnifiedSharedFocusYmd');
    expect(page).toContain('allowFromFallback: false');
    expect(page).toContain('agendaRangeRef');
  });

  it('preserves shared focus across Agenda → Week → Month → Agenda (Nov 1, 2026)', () => {
    const focus = '2026-11-01';
    const today = '2026-11-01';
    expect(partnerUnifiedSharedFocusYmd({ selectedYmd: focus, todayIso: today })).toBe(focus);
    // Week Monday must not become Month focus when selected day is absent.
    expect(
      partnerUnifiedSharedFocusYmd({
        selectedYmd: null,
        fromYmd: '2026-10-26',
        todayIso: today,
        allowFromFallback: false,
      })
    ).toBe(today);

    let nav = {
      view: 'agenda' as const,
      focusYmd: focus,
      fromYmd: '2026-11-01',
      toYmd: '2026-11-30',
      agendaRange: { fromYmd: '2026-11-01', toYmd: '2026-11-30' },
    };

    nav = partnerUnifiedApplyViewChange(nav, 'week');
    // Nov 1 2026 is Sunday → week is Mon Oct 26 – Sun Nov 1
    expect(nav).toMatchObject({
      view: 'week',
      focusYmd: focus,
      fromYmd: '2026-10-26',
      toYmd: '2026-11-01',
    });

    nav = partnerUnifiedApplyViewChange(nav, 'month');
    // Must show November even though the week from/to started in October.
    expect(nav).toMatchObject({
      view: 'month',
      focusYmd: focus,
      fromYmd: '2026-11-01',
      toYmd: '2026-11-30',
    });
    expect(formatPartnerUnifiedMonthLabel(nav.fromYmd)).toMatch(/November 2026/i);

    nav = partnerUnifiedApplyViewChange(nav, 'agenda');
    expect(nav).toMatchObject({
      view: 'agenda',
      focusYmd: focus,
      fromYmd: '2026-11-01',
      toYmd: '2026-11-30',
    });

    // Navigating within Week updates focus for subsequent Month switches.
    nav = partnerUnifiedApplyViewChange(nav, 'week');
    nav = partnerUnifiedApplyShift(nav, 1);
    expect(nav.focusYmd).toBe('2026-11-08');
    expect(nav.fromYmd).toBe('2026-11-02');
    nav = partnerUnifiedApplyViewChange(nav, 'month');
    expect(nav).toMatchObject({
      view: 'month',
      focusYmd: '2026-11-08',
      fromYmd: '2026-11-01',
      toYmd: '2026-11-30',
    });

    // Prev/Next keep day-of-month / weekday across boundaries.
    expect(partnerUnifiedShiftFocusByWeeks(focus, 1)).toBe('2026-11-08');
    expect(partnerUnifiedShiftFocusByMonths(focus, 1)).toBe('2026-12-01');
    expect(partnerUnifiedShiftFocusByMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(partnerUnifiedShiftFocusByMonths('2026-03-31', -1)).toBe('2026-02-28');

    // Year boundary: Dec focus → Jan month/week.
    let boundary = {
      view: 'month' as const,
      focusYmd: '2026-12-28',
      fromYmd: '2026-12-01',
      toYmd: '2026-12-31',
      agendaRange: null,
    };
    boundary = partnerUnifiedApplyShift(boundary, 1);
    expect(boundary.focusYmd).toBe('2027-01-28');
    expect(boundary).toMatchObject({ fromYmd: '2027-01-01', toYmd: '2027-01-31' });
    boundary = partnerUnifiedApplyViewChange(boundary, 'week');
    expect(boundary).toMatchObject({
      fromYmd: '2027-01-25',
      toYmd: '2027-01-31',
      focusYmd: '2027-01-28',
    });
  });

  it('builds mixed tour, stay, and rental events in a range', () => {
    const events = buildPartnerUnifiedCalendarEvents({
      bookings: [
        tourBooking({ booking_date: '2026-10-12' }),
        stayBooking({ checkIn: '2026-10-11', checkOut: '2026-10-13' }),
        rentalBooking({
          pickupAt: '2026-10-12T09:00:00+03:00',
          returnAt: '2026-10-14T18:00:00+03:00',
        }),
        {
          ...tourBooking({ id: 'cancelled', booking_date: '2026-10-12' }),
          status: 'cancelled',
        },
      ],
      fromYmd: '2026-10-11',
      toYmd: '2026-10-14',
      includeOccupiedNights: true,
    });

    const kinds = events.map((e) => `${e.kind}:${e.ymd}`);
    expect(kinds).toContain('stay_check_in:2026-10-11');
    expect(kinds).toContain('stay_occupied:2026-10-12');
    expect(kinds).toContain('stay_check_out:2026-10-13');
    expect(kinds).toContain('tour:2026-10-12');
    expect(kinds).toContain('rental_collection:2026-10-12');
    expect(kinds).toContain('rental_return:2026-10-14');
    expect(events.some((e) => e.bookingId === 'cancelled')).toBe(false);
  });

  it('filters by category and listing together', () => {
    const nowMs = Date.parse('2026-10-12T12:00:00+03:00');
    const events = buildPartnerUnifiedCalendarEvents({
      bookings: [
        tourBooking({ booking_date: '2026-10-12' }),
        rentalBooking({
          pickupAt: '2026-10-12T09:00:00+03:00',
          returnAt: '2026-10-12T18:00:00+03:00',
        }),
      ],
      fromYmd: '2026-10-12',
      toYmd: '2026-10-12',
      nowMs,
    });
    const rentals = filterPartnerUnifiedCalendarEvents(events, {
      category: 'rental',
      listingId: 'listing-rental',
      optionKey: null,
      includePast: false,
    });
    expect(rentals.every((e) => e.category === 'rental')).toBe(true);
    expect(rentals.length).toBe(2);
  });

  it('groups agenda chronologically and summarizes month cells', () => {
    const events = buildPartnerUnifiedCalendarEvents({
      bookings: [
        tourBooking({ booking_date: '2026-10-12' }),
        rentalBooking({
          pickupAt: '2026-10-12T09:00:00+03:00',
          returnAt: '2026-10-13T18:00:00+03:00',
        }),
      ],
      fromYmd: '2026-10-01',
      toYmd: '2026-10-31',
      includeOccupiedNights: false,
    });
    const groups = groupPartnerUnifiedEventsByDate(events);
    expect(groups[0]?.iso <= (groups[1]?.iso ?? groups[0]?.iso ?? '')).toBe(true);

    const summaries = summarizePartnerUnifiedMonthDays(events, 2026, 9);
    const day = summaries.get('2026-10-12');
    expect(day?.tour).toBeGreaterThanOrEqual(1);
    expect(day?.rental).toBeGreaterThanOrEqual(1);
    expect((day?.total ?? 0) >= 2).toBe(true);
  });

  it('defaults to a rolling 30-day range and shifts by range length', () => {
    const range = partnerUnifiedRollingRange('2026-11-01');
    expect(range.fromYmd).toBe('2026-11-01');
    expect(range.toYmd).toBe('2026-11-30');

    const shifted = partnerUnifiedShiftRange(range.fromYmd, range.toYmd, 1);
    expect(shifted.fromYmd).toBe('2026-12-01');
    expect(shifted.toYmd).toBe('2026-12-30');

    const custom = partnerUnifiedNormalizeRange('2026-11-01', '2026-11-30');
    const weeks = partnerUnifiedWeeksCoveringRange(custom.fromYmd, custom.toYmd);
    expect(weeks[0]?.iso <= '2026-11-01').toBe(true);
    expect(weeks.some((c) => c.iso === '2026-11-01' && c.inRange)).toBe(true);
    expect(weeks.some((c) => !c.inRange)).toBe(true);
  });

  it('hides past events by default while keeping ongoing stay nights and future returns', () => {
    // Listing-local Europe/Helsinki noon on 13 Oct — mid-stay, mid-rental.
    const nowMs = Date.parse('2026-10-13T12:00:00+03:00');
    const events = buildPartnerUnifiedCalendarEvents({
      bookings: [
        tourBooking({ id: 'past-tour', booking_date: '2026-10-12' }),
        tourBooking({ id: 'today-tour', booking_date: '2026-10-13' }),
        stayBooking({ id: 'ongoing-stay', checkIn: '2026-10-11', checkOut: '2026-10-15' }),
        rentalBooking({
          id: 'ongoing-rental',
          pickupAt: '2026-10-12T09:00:00+03:00',
          returnAt: '2026-10-14T18:00:00+03:00',
        }),
      ],
      fromYmd: '2026-10-11',
      toYmd: '2026-10-15',
      includeOccupiedNights: true,
      nowMs,
    });

    const upcoming = filterPartnerUnifiedCalendarEvents(events, {
      category: 'all',
      listingId: null,
      optionKey: null,
      includePast: false,
    });
    const keys = upcoming.map((e) => e.key);
    expect(keys.some((k) => k.includes('past-tour'))).toBe(false);
    expect(keys.some((k) => k.includes('today-tour'))).toBe(true);
    expect(keys).toContain('ongoing-stay:stay_occupied:2026-10-13');
    expect(keys).toContain('ongoing-stay:stay_occupied:2026-10-14');
    expect(keys).toContain('ongoing-stay:stay_check_out:2026-10-15');
    expect(keys).not.toContain('ongoing-stay:stay_check_in:2026-10-11');
    expect(keys).not.toContain('ongoing-rental:rental_collection:2026-10-12');
    expect(keys).toContain('ongoing-rental:rental_return:2026-10-14');
    expect(upcoming.every(partnerUnifiedEventIsUpcomingOrOngoing)).toBe(true);

    const withHistory = filterPartnerUnifiedCalendarEvents(events, {
      category: 'all',
      listingId: null,
      optionKey: null,
      includePast: true,
    });
    expect(withHistory.length).toBeGreaterThan(upcoming.length);
    expect(withHistory.some((e) => e.key.includes('past-tour'))).toBe(true);
  });
});
