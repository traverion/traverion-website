import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Stay Reservations premium UX contracts', () => {
  it('keeps Mark as reviewed informational and wires Stay Calendar from the drawer', () => {
    const bookings = readFileSync(join(root, 'pages/supplier/SupplierBookings.tsx'), 'utf8');
    expect(bookings).toContain('partner-stay-ops');
    expect(bookings).toContain('tv-stay-drawer');
    expect(bookings).toContain('Mark as reviewed');
    expect(bookings).toContain('Message guest');
    expect(bookings).toContain('does not change payment or confirmation');
    expect(bookings).toContain('tv-stay-drawer__more');
    expect(bookings).toContain('stay-calendar?listing=');
    expect(bookings).not.toMatch(/\/calendar\?listing=/);
  });

  it('ships stay-ops visual tokens for cards, drawer and month selection', () => {
    const css = readFileSync(join(root, 'index.css'), 'utf8');
    expect(css).toContain('.partner-stay-ops');
    expect(css).toContain('.tv-stay-drawer__footer');
    expect(css).toContain('.tv-stay-drawer__inout');
    expect(css).toContain('.tv-stay-cal-toast');
    expect(css).toContain('.tv-stay-cal-page .tv-stay-cal-month .tv-cal-day');
    expect(css).toContain('.is-in-range');
    expect(css).toContain('.is-range-start');
  });
});
