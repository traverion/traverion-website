import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RentalOpsBookingCard, {
  type RentalOpsCardModel,
} from '../../components/supplier/RentalOpsBookingCard';
import { formatRentalQuantityLabel } from '../../lib/rental-presentation';

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
  termsSummary: 'Flexible cancellation · €200 excess on damage claims',
};

describe('Mission 04: rental booking ops UI (no handover)', () => {
  it('wires rental card/detail without collection/return confirmation actions', () => {
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    expect(bookings).toContain('RentalOpsBookingCard');
    expect(bookings).toContain('RentalOpsBookingDetail');
    expect(bookings).toContain('rentalDetailMode');
    expect(bookings).toContain('expandedRentalId');
    expect(bookings).toContain('rentalBookingSimpleStatusLabel');
    expect(bookings).toContain('formatRentalQuantityLabel');
    expect(bookings).not.toContain('requestRentalHandover');
    expect(bookings).not.toContain('setRentalOpsStatus');
    expect(bookings).not.toContain('Mark rental collected');
    expect(bookings).not.toContain('Mark collected');
    expect(bookings).not.toContain('rentalHandoverStatusLabel');
    expect(bookings).toContain("tourDetailMode = Boolean(!isStayDesk && !isRentalDesk && highlightBookingId)");

    const card = readFileSync(join(root, 'components/supplier/RentalOpsBookingCard.tsx'), 'utf8');
    expect(card).toContain('Message customer');
    expect(card).toContain('Rental period');
    expect(card).toContain('Collection ·');
    expect(card).toContain('Customer');
    expect(card).not.toContain('handoverLabel');
    expect(card).not.toContain('Awaiting collection');
    expect(card).not.toContain('Message guest');

    const detail = readFileSync(join(root, 'components/supplier/RentalOpsBookingDetail.tsx'), 'utf8');
    expect(detail).toContain('Rental booking');
    expect(detail).toContain('Rental details');
    expect(detail).toContain('Rental terms');
    expect(detail).toContain('Collection place');
    expect(detail).toContain('onMessageCustomer');
    expect(detail).toContain('BookingOpsActionRail');
    expect(detail).not.toContain('Handover');
    expect(detail).not.toContain('Mark collected');
    expect(detail).not.toContain('Mark returned');
    expect(detail).not.toContain('onHandoverAction');
  });

  it('renders compact rental card with schedule facts and Confirmed status', () => {
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
    expect(html).toContain('Confirmed');
    expect(html).toContain('Collection ·');
    expect(html).toContain('Message customer');
    expect(html).toContain('damage claims');
    expect(html).not.toContain('Awaiting collection');
    expect(html).not.toContain('Participants');
  });

  it('keeps rental quantity labels without guest language', () => {
    expect(formatRentalQuantityLabel(1, 'cameras_electronics')).toBe('1 camera');
    expect(formatRentalQuantityLabel(2, 'cameras_electronics')).toBe('2 cameras');
  });
});
