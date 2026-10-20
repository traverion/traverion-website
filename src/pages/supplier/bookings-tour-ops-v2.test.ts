import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import TourOpsBookingCard, {
  type TourOpsCardModel,
} from '../../components/supplier/TourOpsBookingCard';

const baseModel: TourOpsCardModel = {
  id: 'b1',
  listingTitle: 'Helsinki Harbour Walk',
  optionLabel: 'Morning departure',
  imageUrl: null,
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  guestPhone: null,
  dateLine: '12 Jun · 09:00',
  departureNote: null,
  participantLabel: '2 adults',
  statusLabel: 'Confirmed',
  statusClass: 'text-finland ring-finland/20 bg-finland/5',
  referenceLabel: 'TV-ABCDEF',
  purchaseDateLabel: '1 Jun 2026',
  pickupKind: 'meeting',
  pickupSummary: 'Market Square fountain',
  durationLabel: '2 hours',
  guestNotes: null,
  warning: null,
  needsReview: false,
  guestTotalLabel: '€120.00',
  earningsLabel: '€102.00',
  earningsLoading: false,
  paymentLabel: 'Paid',
};

describe('Bookings luxury redesign V2 — tour ops card', () => {
  it('wires TourOpsBookingCard and partner-bookings-workspace into SupplierBookings', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain("from '../../components/supplier/TourOpsBookingCard'");
    expect(src).toContain('partner-bookings-workspace');
    expect(src).toContain('expandedTourId');
    expect(src).toContain('Manage your reservations, guests, departures, and booking details.');
    expect(src).not.toContain("badge={isStayDesk ? null : 'Operate'}");
    expect(src).toContain('badge={null}');
    expect(src).toContain('openSupplierInbox(booking.id)');
    expect(src).toContain('earningsLabel: tourExpanded ? expandedEarningsLabel : null');
    const card = readFileSync(
      resolve(__dirname, '../../components/supplier/TourOpsBookingCard.tsx'),
      'utf8'
    );
    expect(card).toContain('Supplier earnings');
    expect(card).toContain('Booking total');
    expect(card).toContain('Message guest');
  });

  it('defines tour-ops and bookings workspace styles', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.partner-bookings-workspace');
    expect(css).toContain('.tour-ops-card');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('keeps stay desk on StayOpsReservationCard', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('StayOpsReservationCard');
    expect(src).toContain('isStayDesk');
    expect(src).toContain('expandedStayId');
  });

  it('renders compact row with experience-first hierarchy and expandable panel', () => {
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
    expect(html).toContain('Helsinki Harbour Walk');
    expect(html).toContain('Morning departure');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('TV-ABCDEF');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden');
  });

  it('shows payment labels distinctly when expanded', () => {
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
    expect(html).toContain('Booking total');
    expect(html).toContain('Supplier earnings');
    expect(html).toContain('€120.00');
    expect(html).toContain('€102.00');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/hidden[^>]*tour-ops-card__panel/);
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
