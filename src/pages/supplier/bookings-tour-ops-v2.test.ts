import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import TourOpsBookingCard, {
  type TourOpsCardModel,
} from '../../components/supplier/TourOpsBookingCard';
import { PARTNER_BOOKINGS_SORTS, PARTNER_BOOKINGS_TRAVEL } from '../../lib/partner-bookings-desk';

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
  statusLabel: 'Confirmed',
  statusClass: 'text-finland ring-finland/20 bg-finland/5',
  referenceLabel: 'TV-ABCDEF',
  purchaseDateLabel: '1 Jun 2026',
  arrivalRailLabel: 'Pickup',
  arrivalRailWarn: false,
  pickupSummary: 'Hotel lobby, 08:30',
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
    expect(src).toContain('expandedTourId');
    expect(src).toContain('tourDetailMode');
    expect(src).toContain('resolvePartnerArrivalDisplay');
    expect(src).toContain('partnerBookingDeskPath');
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
    expect(card).toContain('tour-ops-card__pickup');
    expect(card).toContain('tour-ops-card__rail-stack');
    const detail = readFileSync(
      resolve(__dirname, '../../components/supplier/TourOpsBookingDetail.tsx'),
      'utf8'
    );
    expect(detail).toContain('tour-ops-detail__grid');
    expect(detail).toContain('tour-ops-detail__aside');
    expect(detail).not.toContain('Acknowledge');
    expect(detail).toContain('Message customer');
  });

  it('defines tour-ops and single-row desktop toolbar styles', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.partner-bookings-workspace');
    expect(css).toContain('.tour-ops-card');
    expect(css).toContain('.tour-ops-detail');
    expect(css).toContain('max-width: min(72rem, 100%)');
    expect(css).toContain('.tour-ops-detail__grid');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('One horizontal desktop row');
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('.tour-ops-card__summary-grid');
    expect(css).toContain('.tour-ops-card__pickup');
  });

  it('uses short readable travel and sort filter labels', () => {
    expect(PARTNER_BOOKINGS_TRAVEL.find((t) => t.value === 'all')?.label).toBe('Travel date');
    expect(PARTNER_BOOKINGS_SORTS.find((s) => s.value === 'newest')?.label).toBe('Newest');
  });

  it('keeps stay desk on StayOpsReservationCard', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('StayOpsReservationCard');
    expect(src).toContain('isStayDesk');
    expect(src).toContain('expandedStayId');
  });

  it('keeps guest name out of the collapsed scan row and puts arrival under status', () => {
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
    expect(collapsed).toContain('2 adults');
    expect(collapsed).not.toContain('Ada Lovelace');
    expect(collapsed).toContain('tour-ops-card__pickup');
    expect(collapsed).toContain('Pickup');
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
    expect(html).toContain('+358 40 123 4567');
    expect(html).toContain('Customer paid');
    expect(html).toContain('€119.00');
    expect(html).toContain('Traverion commission');
    expect(html).toContain('15%');
    expect(html).toContain('−€17.85');
    expect(html).toContain('Supplier earnings');
    expect(html).toContain('€101.15');
    expect(html).not.toContain('Mark as reviewed');
    expect(html).not.toContain('Acknowledge');
    expect(html).toContain('View details');
    expect(html).toContain('Message guest');
    expect(html).toContain('aria-expanded="true"');
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
