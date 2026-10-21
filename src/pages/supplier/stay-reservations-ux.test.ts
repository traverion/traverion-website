import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Stay Reservations premium UX contracts', () => {
  it('uses Tour-aligned expandable stay cards and full details page', () => {
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    const card = readFileSync(join(root, 'components/supplier/StayOpsReservationCard.tsx'), 'utf8');
    const detail = readFileSync(join(root, 'components/supplier/StayOpsBookingDetail.tsx'), 'utf8');
    const ui = readFileSync(join(root, 'components/supplier/supplierUi.tsx'), 'utf8');
    expect(bookings).toContain('partner-bookings-workspace');
    expect(bookings).toContain('StayOpsReservationCard');
    expect(bookings).toContain('StayOpsBookingDetail');
    expect(bookings).toContain('stayDetailMode');
    expect(bookings).toContain('stay-calendar?listing=');
    expect(bookings).not.toMatch(/\/calendar\?listing=/);
    expect(bookings).not.toContain('Acknowledge');
    expect(bookings).not.toContain('Mark as reviewed');
    expect(bookings).toContain('openBookingInbox');
    expect(card).toContain('tour-ops-card');
    expect(card).toContain('View details');
    expect(card).toContain('Message guest');
    expect(card).toContain('onToggleExpand');
    expect(card).toContain('Arrival & departure');
    expect(card).toContain('tour-ops-card__summary-grid');
    expect(detail).toContain('tour-ops-detail');
    expect(detail).toContain('Back to reservations');
    expect(detail).toContain('Message customer');
    expect(detail).toContain('House rules');
    expect(detail).toContain('Open Stay Calendar');
    expect(detail).toContain('Booking activity');
    expect(ui).toContain("'page'");
    expect(ui).toContain('Back to reservations');
    expect(bookings).toContain('remaining_gross_minor');
    expect(bookings).toContain('remaining_commission_minor');
    expect(bookings).toContain('StayRequestActions');
    expect(bookings).toMatch(/audit log failed/);
  });

  it('keeps stay calendar tokens and shared tour-ops detail activity styles', () => {
    const css = readFileSync(join(root, 'index.css'), 'utf8');
    expect(css).toContain('.tour-ops-card');
    expect(css).toContain('.tour-ops-detail');
    expect(css).toContain('.tour-ops-detail__activity');
    expect(css).toContain('.partner-bookings-workspace');
    expect(css).toContain('.tv-stay-cal-toast');
    expect(css).toContain('.tv-stay-cal-page .tv-stay-cal-month .tv-cal-day');
    expect(css).toContain('.is-in-range');
    expect(css).toContain('.is-range-start');
  });
});
