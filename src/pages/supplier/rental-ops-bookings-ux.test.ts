import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RentalOpsBookingCard, {
  type RentalOpsCardModel,
} from '../../components/supplier/RentalOpsBookingCard';
import {
  formatRentalQuantityLabel,
  rentalHandoverStatusLabel,
} from '../../lib/rental-presentation';
import { validateRentalBookingTransition } from '../../lib/rental-booking-domain';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const cardModel: RentalOpsCardModel = {
  id: 'r1',
  listingTitle: 'Sony A7 IV',
  variantLabel: 'Body only',
  imageUrl: null,
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  customerPhone: '+358 40 123 4567',
  customerNotes: null,
  periodLine: '1 Jun 09:00 → 2 Jun 09:00',
  collectionLabel: '1 Jun 09:00',
  returnLabel: '2 Jun 09:00',
  quantityLabel: '1 camera',
  statusLabel: 'Confirmed',
  statusClass: 'text-finland ring-finland/20 bg-finland/5',
  handoverLabel: 'Awaiting collection',
  handoverComplete: false,
  referenceLabel: 'TV-SONY01',
  purchaseDateLabel: '28 May 2026',
  collectionPlace: 'Studio desk, Helsinki',
  returnPlace: 'Studio desk, Helsinki',
  warning: null,
  guestPaidLabel: '€89.00',
  commissionLabel: '€13.35',
  commissionRateLabel: '15%',
  earningsLabel: '€75.65',
  financeLoading: false,
  paymentLabel: 'Paid',
};

describe('Mission 02: rental booking ops UI', () => {
  it('wires dedicated rental card and detail on the rental desk only', () => {
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    expect(bookings).toContain('RentalOpsBookingCard');
    expect(bookings).toContain('RentalOpsBookingDetail');
    expect(bookings).toContain('rentalDetailMode');
    expect(bookings).toContain('expandedRentalId');
    expect(bookings).toContain('requestRentalHandover');
    expect(bookings).toContain('PartnerConfirmModal');
    expect(bookings).toContain('Mark rental collected?');
    expect(bookings).toContain('formatRentalQuantityLabel');
    expect(bookings).toContain('rentalHandoverStatusLabel');
    expect(bookings).toContain("tourDetailMode = Boolean(!isStayDesk && !isRentalDesk && highlightBookingId)");
    expect(bookings).not.toContain('Awaiting pickup');
    expect(bookings).not.toMatch(/isRentalDesk[\s\S]{0,80}TourOpsBookingCard/);
    expect(bookings).toContain("inventoryFamily === 'stay' || inventoryFamily === 'rental'");

    const card = readFileSync(join(root, 'components/supplier/RentalOpsBookingCard.tsx'), 'utf8');
    expect(card).toContain('Message customer');
    expect(card).toContain('Rental period');
    expect(card).toContain('Collection ·');
    expect(card).toContain('Customer');
    expect(card).not.toContain('Message guest');
    expect(card).not.toContain('Participants');
    expect(card).not.toContain('Departure');

    const detail = readFileSync(join(root, 'components/supplier/RentalOpsBookingDetail.tsx'), 'utf8');
    expect(detail).toContain('Rental booking');
    expect(detail).toContain('Rental details');
    expect(detail).toContain('Handover');
    expect(detail).toContain('Mark collected');
    expect(detail).toContain('Mark returned');
    expect(detail).toContain('Collection place');
    expect(detail).toContain('onMessageCustomer');
    expect(detail).toContain('BookingOpsActionRail');
    expect(detail).not.toContain('Open Pickup planner');
    expect(detail).not.toContain('Lead guest');
    expect(detail).not.toContain('Participants');
  });

  it('renders compact rental card with collection terminology', () => {
    const html = renderToStaticMarkup(
      createElement(RentalOpsBookingCard, {
        model: cardModel,
        expanded: true,
        selected: false,
        checkbox: createElement('input', { type: 'checkbox', readOnly: true }),
        onToggleExpand: () => undefined,
        onOpenDetails: () => undefined,
        onMessageCustomer: () => undefined,
        onCopyReference: () => undefined,
      })
    );
    expect(html).toContain('Sony A7 IV');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('1 camera');
    expect(html).toContain('Awaiting collection');
    expect(html).toContain('Collection ·');
    expect(html).toContain('Message customer');
    expect(html).not.toContain('guest');
    expect(html).not.toContain('Participants');
  });

  it('uses rental handover labels and quantity units', () => {
    expect(rentalHandoverStatusLabel('awaiting_pickup')).toBe('Awaiting collection');
    expect(rentalHandoverStatusLabel('collected')).toBe('Awaiting return');
    expect(rentalHandoverStatusLabel('returned')).toBe('Returned');
    expect(formatRentalQuantityLabel(1, 'cameras')).toMatch(/1 /);
    expect(formatRentalQuantityLabel(2, 'cameras')).toMatch(/2 /);
  });

  it('blocks invalid handover transitions before confirm', () => {
    const tooEarly = validateRentalBookingTransition(
      {
        status: 'confirmed',
        paymentStatus: 'paid',
        opsStatus: 'awaiting_pickup',
        holdStatus: 'confirmed',
      },
      'mark_returned'
    );
    expect(tooEarly.ok).toBe(false);

    const collect = validateRentalBookingTransition(
      {
        status: 'confirmed',
        paymentStatus: 'paid',
        opsStatus: 'awaiting_pickup',
        holdStatus: 'confirmed',
      },
      'mark_collected'
    );
    expect(collect.ok).toBe(true);

    const returned = validateRentalBookingTransition(
      {
        status: 'confirmed',
        paymentStatus: 'paid',
        opsStatus: 'collected',
        holdStatus: 'confirmed',
      },
      'mark_returned'
    );
    expect(returned.ok).toBe(true);
  });
});
