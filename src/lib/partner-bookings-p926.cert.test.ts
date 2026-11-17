import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { partnerTodayEmptyScheduleCopy } from './partner-today-copy';

const root = resolve(__dirname, '../..');

describe('P9.26 partner booking experience presentation', () => {
  const bookings = readFileSync(resolve(root, 'src/pages/supplier/SupplierBookings.tsx'), 'utf8');
  const dashboard = readFileSync(resolve(root, 'src/pages/supplier/SupplierDashboard.tsx'), 'utf8');
  const primitives = readFileSync(
    resolve(root, 'src/components/supplier/BookingOpsDetailPrimitives.tsx'),
    'utf8'
  );
  const cancel = readFileSync(
    resolve(root, 'src/components/supplier/SupplierCancellationWorkflow.tsx'),
    'utf8'
  );
  const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');

  it('uses guest-facing messaging labels and quiet list status tokens', () => {
    expect(primitives).toContain('Message guest');
    expect(primitives).toContain('Guest paid');
    expect(primitives).not.toContain('Message customer');
    expect(bookings).toContain('tour-ops-card__status--confirmed');
    expect(bookings).toContain('tour-ops-card__status--pickup-missing');
    expect(css).toContain('.tour-ops-card__status--confirmed');
    expect(css).toContain('.tour-ops-card__status--cancelled');
  });

  it('softens home and cancel technical jargon', () => {
    expect(dashboard).toContain('Payment pending');
    expect(dashboard).toContain('Refund needs Traverion action');
    expect(dashboard).not.toContain('Manual Stripe refund required');
    expect(dashboard).toContain('>Guest</span>');
    expect(cancel).toContain('Guest email accepted');
    expect(cancel).not.toContain('Mail provider accepted the notice');
  });

  it('keeps rental empty state operational and schedule copy inclusive', () => {
    expect(bookings).toContain('When guests book a rental, collection and return details appear here.');
    expect(bookings).toContain('No stay reservations yet');
    expect(bookings).toContain('No tour bookings yet');
    expect(bookings).not.toContain('Rental checkout is not open to travelers yet');
    expect(bookings).not.toContain('automatic damage fees');
    const empty = partnerTodayEmptyScheduleCopy(0);
    expect(empty.body.toLowerCase()).toMatch(/rental/);
  });
});
