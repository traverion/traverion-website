import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import TourOpsBookingCard, {
  type TourOpsCardModel,
} from '../../components/supplier/TourOpsBookingCard';
import { formatPartnerTravelRangeLabel } from '../../components/calendar/TraverionDateRangeField';
import { partnerBookingListBadgeLabel } from '../../lib/partner-bookings-desk';

const baseModel: TourOpsCardModel = {
  id: 'b1',
  listingTitle: 'Helsinki Harbour Walk',
  optionLabel: 'Morning departure',
  imageUrl: null,
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  guestPhone: '+358 40 123 4567',
  dateLine: '12 Jun · 09:00',
  departureNote: null,
  participantLabel: '2 adults',
  statusLabel: null,
  statusClass: '',
  referenceLabel: 'TV-ABCDEF',
  purchaseDateLabel: '1 Jun 2026',
  arrivalRailLabel: 'Pickup',
  arrivalRailWarn: false,
  pickupSummary: 'Hotel lobby, 08:30',
  arrivalPlace: 'Hotel lobby',
  arrivalInstructions: '08:30 pickup window',
  arrivalSectionLabel: 'Accommodation pickup',
  durationLabel: '2 hours',
  guestNotes: null,
  warning: null,
  guestPaidLabel: '€119.00',
  commissionLabel: '€17.85',
  commissionRateLabel: '15%',
  earningsLabel: '€101.15',
  financeLoading: false,
  paymentLabel: 'Paid',
};

describe('Bookings V4 — tour ops card & detail page', () => {
  it('wires TourOpsBookingCard, detail page, and partner-bookings-workspace', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain("from '../../components/supplier/TourOpsBookingCard'");
    expect(src).toContain("from '../../components/supplier/TourOpsBookingDetail'");
    expect(src).toContain('partner-bookings-workspace');
    expect(src).toContain('partner-bookings-workspace__controls');
    expect(src).toContain('partner-bookings-workspace__quick');
    expect(src).toContain('partner-bookings-workspace__seg');
    expect(src).toContain('TraverionDateRangeField');
    expect(src).toContain('filterOptionId');
    expect(src).toContain('expandedTourId');
    expect(src).toContain('tourDetailMode');
    expect(src).toContain('resolvePartnerArrivalDisplay');
    expect(src).toContain('partnerBookingDeskPath');
    expect(src).toContain('listStatusBadge');
    expect(src).not.toContain('bookings-filter-status');
    expect(src).not.toContain('bookings-filter-sort');
    expect(src).not.toContain('Mark as reviewed');
    expect(src).not.toContain('Acknowledge');
    expect(src).toContain('openBookingInbox(booking.id)');
    expect(src).toContain('TourOpsBookingDetail');
    const card = readFileSync(
      resolve(__dirname, '../../components/supplier/TourOpsBookingCard.tsx'),
      'utf8'
    );
    expect(card).toContain('Supplier earnings');
    expect(card).toContain('Customer paid');
    expect(card).toContain('Traverion commission');
    expect(card).toContain('Message guest');
    expect(card).not.toContain('Mark as reviewed');
    expect(card).not.toContain('Acknowledge');
    expect(card).toContain('tour-ops-card__expand');
    expect(card).toContain('tour-ops-card__facts');
    expect(card).toContain('tour-ops-card__option');
    const detail = readFileSync(
      resolve(__dirname, '../../components/supplier/TourOpsBookingDetail.tsx'),
      'utf8'
    );
    const primitives = readFileSync(
      resolve(__dirname, '../../components/supplier/BookingOpsDetailPrimitives.tsx'),
      'utf8'
    );
    expect(detail).toContain('tour-ops-detail__grid');
    expect(detail).toContain('tour-ops-detail__aside');
    expect(detail).not.toContain('Acknowledge');
    expect(detail).toContain('BookingOpsActionRail');
    expect(primitives).toContain('Message customer');
  });

  it('defines tour-ops and premium toolbar styles', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.partner-bookings-workspace');
    expect(css).toContain('.tour-ops-card');
    expect(css).toContain('.tour-ops-detail');
    // Detail pages may keep a reading width; the list workspace must stay full-bleed.
    const workspaceBlock = css.slice(
      css.indexOf('.partner-bookings-workspace {'),
      css.indexOf('.partner-bookings-workspace__toolbar')
    );
    expect(workspaceBlock).toContain('max-width: none');
    expect(workspaceBlock).not.toContain('max-width: min(76rem');
    expect(css).toContain('.tour-ops-detail__grid');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('One horizontal desktop row');
    expect(css).toContain('.tour-ops-card__summary-grid');
    expect(css).toContain('.tour-ops-card__facts');
    expect(css).toContain('.tour-ops-card__expand');
    expect(css).toContain('.partner-bookings-workspace__seg');
    expect(css).toContain('.partner-bookings-workspace__quick-group');
    expect(css).not.toContain('partner-bookings-workspace__quick-label');
    expect(css).toContain('.partner-bookings-daterange__trigger');
    expect(css).toContain('--pb-control-h');
    expect(css).toContain('.tour-ops-card__finance-note');
    expect(css).toContain('.tour-ops-card__summary-contact');
    expect(css).toContain('.tour-ops-card__action-btn');
  });

  it('formats compact travel range labels', () => {
    expect(formatPartnerTravelRangeLabel('2026-11-12', '2026-11-12')).toMatch(/12/);
    expect(formatPartnerTravelRangeLabel('2026-11-12', '2026-11-15')).toContain('–');
    expect(formatPartnerTravelRangeLabel('', '')).toBe('');
  });

  it('hides Confirmed badges on the list while keeping exceptional statuses', () => {
    expect(partnerBookingListBadgeLabel('confirmed')).toBeNull();
    expect(partnerBookingListBadgeLabel('pending')).toBe('Pending');
    expect(partnerBookingListBadgeLabel('cancelled')).toBe('Cancelled');
  });

  it('keeps stay desk on StayOpsReservationCard', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('StayOpsReservationCard');
    expect(src).toContain('isStayDesk');
    expect(src).toContain('expandedStayId');
  });

  it('leads collapsed scan with title, option, and essential facts', () => {
    const html = renderToStaticMarkup(
      createElement(TourOpsBookingCard, {
        model: baseModel,
        expanded: false,
        selected: false,
        checkbox: createElement('input', { type: 'checkbox', readOnly: true }),
        onToggleExpand: () => undefined,
        onOpenDetails: () => undefined,
        onMessageGuest: () => undefined,
        onCopyReference: () => undefined,
      })
    );
    const panelAt = html.indexOf('tour-ops-card__panel');
    expect(panelAt).toBeGreaterThan(0);
    const collapsed = html.slice(0, panelAt);
    expect(collapsed).toContain('Helsinki Harbour Walk');
    expect(collapsed).toContain('Morning departure');
    expect(collapsed).toContain('TV-ABCDEF');
    expect(collapsed).toContain('12 Jun · 09:00');
    expect(collapsed).toContain('tour-ops-card__title');
    expect(collapsed).toContain('tour-ops-card__option');
    expect(collapsed).toContain('tour-ops-card__facts');
    expect(collapsed).toContain('tour-ops-card__expand');
    expect(collapsed).toContain('Ada Lovelace');
    expect(collapsed).toContain('2 adults');
    expect(collapsed).not.toContain('Confirmed');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows minimal expanded summary with financial breakdown', () => {
    const html = renderToStaticMarkup(
      createElement(TourOpsBookingCard, {
        model: baseModel,
        expanded: true,
        selected: false,
        checkbox: createElement('input', { type: 'checkbox', readOnly: true }),
        onToggleExpand: () => undefined,
        onOpenDetails: () => undefined,
        onMessageGuest: () => undefined,
        onCopyReference: () => undefined,
      })
    );
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('ada@example.com');
    expect(html).toContain('+358 40 123 4567');
    expect(html).toContain('Booking details');
    expect(html).toContain('Hotel lobby');
    expect(html).toContain('08:30 pickup window');
    expect(html).toContain('Paid');
    expect(html).toContain('Customer paid');
    expect(html).toContain('€119.00');
    expect(html).toContain('Traverion commission');
    expect(html).toContain('15%');
    expect(html).toContain('−€17.85');
    expect(html).toContain('Supplier earnings');
    expect(html).toContain('€101.15');
    expect(html).toContain('Supplier earnings are not a payout.');
    expect(html).not.toContain('Mark as reviewed');
    expect(html).not.toContain('Acknowledge');
    expect(html).toContain('View details');
    expect(html).toContain('Message guest');
    // One Message guest action in the footer — no duplicate guest-section link.
    expect(html.match(/Message guest/g)?.length).toBe(1);
    expect(html).toContain('aria-expanded="true"');
  });

  it('keeps listing title primary with option underneath', () => {
    const html = renderToStaticMarkup(
      createElement(TourOpsBookingCard, {
        model: {
          ...baseModel,
          listingTitle:
            'Rovaniemi: Northern Lights Guarantee — 100% Refund + Photos with an Extremely Long Marketing Suffix',
          statusLabel: 'Pending',
          statusClass: 'bg-amber-50 text-amber-900 ring-amber-200/80',
        },
        expanded: false,
        selected: false,
        checkbox: createElement('input', { type: 'checkbox', readOnly: true }),
        onToggleExpand: () => undefined,
        onOpenDetails: () => undefined,
        onMessageGuest: () => undefined,
        onCopyReference: () => undefined,
      })
    );
    expect(html).toContain('tour-ops-card__title');
    expect(html).toContain('Northern Lights Guarantee');
    expect(html).toContain('Morning departure');
    expect(html).toContain('tour-ops-card__option');
    expect(html).toContain('Pending');
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('tour-ops-card__option');
    expect(css).toContain('tour-ops-card__facts');
  });

  it('isolates checkbox and copy clicks from row expand via stopPropagation', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/supplier/TourOpsBookingCard.tsx'),
      'utf8'
    );
    expect(src).toContain('const stop = (e: MouseEvent) => e.stopPropagation()');
    expect(src).toContain('onClick={stop}');
    expect(src).toContain('stop(e)');
    expect(src).toContain('onCopyReference()');
    expect(src).toContain('aria-expanded={expanded}');
  });
});
