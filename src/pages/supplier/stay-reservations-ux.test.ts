import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Stay Reservations premium UX contracts', () => {
  it('uses expandable stay cards and a focused details page without inventing payment confirmations', () => {
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    const card = readFileSync(join(root, 'components/supplier/StayOpsReservationCard.tsx'), 'utf8');
    const ui = readFileSync(join(root, 'components/supplier/supplierUi.tsx'), 'utf8');
    expect(bookings).toContain('partner-stay-ops');
    expect(bookings).toContain('StayOpsReservationCard');
    expect(bookings).toContain("variant={isStayDesk ? 'page' : 'drawer'}");
    expect(bookings).toContain('Mark as reviewed');
    expect(bookings).toContain('Message guest');
    expect(bookings).toContain('does not change payment or confirmation');
    expect(bookings).toContain('stay-calendar?listing=');
    expect(bookings).not.toMatch(/\/calendar\?listing=/);
    expect(card).toContain('Full details');
    expect(card).toContain('onToggleExpand');
    expect(ui).toContain("'page'");
    expect(ui).toContain('Back to reservations');
  });

  it('ships stay-ops V3 tokens for expandable cards, detail page and month selection', () => {
    const css = readFileSync(join(root, 'index.css'), 'utf8');
    expect(css).toContain('.partner-stay-ops');
    expect(css).toContain('.stay-ops-card');
    expect(css).toContain('.stay-ops-detail');
    expect(css).toContain('.tv-stay-drawer__footer');
    expect(css).toContain('.tv-stay-drawer__inout');
    expect(css).toContain('.tv-stay-cal-toast');
    expect(css).toContain('.tv-stay-cal-page .tv-stay-cal-month .tv-cal-day');
    expect(css).toContain('.is-in-range');
    expect(css).toContain('.is-range-start');
  });
});
