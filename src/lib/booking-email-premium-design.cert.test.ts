import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const shared = (...parts: string[]) => join(here, '../../supabase/functions', ...parts);

describe('Premium booking email & receipt design (cert)', () => {
  const html = readFileSync(shared('_shared/transactional-html.ts'), 'utf8');
  const pdf = readFileSync(shared('_shared/receipt-pdf.ts'), 'utf8');
  const customer = readFileSync(shared('notify-customer-booking/index.ts'), 'utf8');
  const supplier = readFileSync(shared('notify-supplier-event/index.ts'), 'utf8');

  it('uses Traverion dark email tokens', () => {
    expect(html).toContain("pageBg: '#101318'");
    expect(html).toContain("cardBg: '#1C222C'");
    expect(html).toContain("text: '#FFFFFF'");
    expect(html).toContain("muted: '#AEB8C8'");
    expect(html).toContain('emailProductBlock');
    expect(html).toContain('emailAmountBlock');
  });

  it('PDF receipt stays light-theme financial document', () => {
    expect(pdf).toContain('Payment receipt');
    expect(pdf).toContain('publicReference');
    expect(pdf).toContain('partyLabel');
    expect(pdf).toContain('never invent VAT');
    expect(pdf).toContain("kv('Pickup'");
    expect(pdf).toContain("kv('Return'");
  });

  it('customer confirmation subject and CTA', () => {
    expect(customer).toContain('Your Traverion booking is confirmed ·');
    expect(customer).toContain('Your booking is confirmed!');
    expect(customer).toContain("ctaLabel ?? 'View your booking'");
    expect(customer).toContain('emailProductBlock');
    expect(customer).toContain("detailRow('Pickup'");
    expect(customer).toContain("detailRow('Quantity'");
  });

  it('supplier new booking shows gross Booking value only', () => {
    expect(supplier).toContain('New booking confirmed');
    expect(supplier).toContain("label: 'Booking value'");
    expect(supplier).toContain('Gross customer amount · payout details are in Income');
    expect(supplier).toContain('amount_paid');
    // Must not render net/commission as a labeled money row in HTML.
    expect(supplier).not.toMatch(/emailDetailRow\('(Net earnings|Commission|Supplier payout)'/i);
    expect(supplier).not.toMatch(/label:\s*'(Net earnings|Commission|Supplier payout)'/);
    expect(supplier).toContain("? 'Quantity'");
    expect(supplier).toContain("emailDetailRow('Pickup'");
  });
});
