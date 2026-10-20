import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Stay Reservations premium UX contracts', () => {
  it('uses expandable stay cards and a two-column details page without inventing payment confirmations', () => {
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    const card = readFileSync(join(root, 'components/supplier/StayOpsReservationCard.tsx'), 'utf8');
    const ui = readFileSync(join(root, 'components/supplier/supplierUi.tsx'), 'utf8');
    expect(bookings).toContain('partner-stay-ops');
    expect(bookings).toContain('StayOpsReservationCard');
    expect(bookings).toContain('stay-ops-detail-page');
    expect(bookings).toContain('stay-ops-detail__grid');
    expect(bookings).toContain("variant={isStayDesk ? 'page' : 'drawer'}");
    expect(bookings).toContain('Mark as reviewed');
    expect(bookings).toContain('Message guest');
    expect(bookings).toContain('does not change payment or confirmation');
    expect(bookings).toContain('stay-calendar?listing=');
    expect(bookings).not.toMatch(/\/calendar\?listing=/);
    expect(card).toContain('View details');
    expect(card).toContain('Message guest');
    expect(card).toContain('onToggleExpand');
    expect(card).toContain('stay-ops-card__cell');
    expect(card).toContain('stay-ops-card__rail');
    expect(ui).toContain("'page'");
    expect(ui).toContain('Back to reservations');
    expect(bookings).toContain('StayOpsMoneyStack');
    expect(bookings).toContain('StayOpsInOut');
  });

  it('ships stay-ops visual tokens for cards, detail panels and month selection', () => {
    const css = readFileSync(join(root, 'index.css'), 'utf8');
    expect(css).toContain('.partner-stay-ops');
    expect(css).toContain('.stay-ops-card');
    expect(css).toContain('.stay-ops-detail-page');
    expect(css).toContain('.stay-ops-detail__panel');
    expect(css).toContain('.stay-ops-detail__inout');
    expect(css).toContain('.stay-ops-money');
    expect(css).toContain('.stay-ops-segment');
    expect(css).toContain('.stay-ops-booking-summary');
    expect(css).toContain('.tv-stay-cal-toast');
    expect(css).toContain('.tv-stay-cal-page .tv-stay-cal-month .tv-cal-day');
    expect(css).toContain('.is-in-range');
    expect(css).toContain('.is-range-start');
  });
});
