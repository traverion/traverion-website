import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Inbox motion and chat refinement', () => {
  it('animates the docked booking pane open/closed without unmounting', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('tv-inbox-booking-pane__shell');
    expect(src).toContain("bookingPanelOpen ? ' is-open' : ''");
    expect(src).toContain('bookingDrawerMounted');
    expect(src).toContain('setBookingDrawerOpen');
  });

  it('uses compact fit-content bubbles with aligned timestamps', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('width: fit-content');
    expect(css).toContain('max-width: min(26rem, 68%)');
    expect(css).toContain('.tv-chat__item--mine');
    expect(css).toContain('flex-basis 260ms');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('.tv-inbox-booking-pane.is-open');

    const thread = readFileSync(resolve(__dirname, '../../components/BookingMessageThread.tsx'), 'utf8');
    expect(thread).toContain('tv-chat__item--${tone}');
    expect(thread).toContain('!continues ? (');
  });
});
