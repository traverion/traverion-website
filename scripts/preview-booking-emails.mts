/**
 * Local HTML + PDF previews for premium booking emails / receipts.
 * Run: npx vite-node scripts/preview-booking-emails.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_THEME,
  emailAmountBlock,
  emailDetailRow,
  emailProductBlock,
  transactionalEmailDocument,
} from '../supabase/functions/_shared/transactional-html.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../.tmp/booking-emails-redesign');
mkdirSync(outDir, { recursive: true });

const IMG =
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=400&q=60';

type Cat = 'tour' | 'stay' | 'rental';

function rowsFor(cat: Cat, audience: 'customer' | 'supplier'): string {
  const common: Array<[string, string]> = [];
  if (cat === 'tour') {
    common.push(
      ['Booking reference', 'TV-48291'],
      ['Date', '15 Nov 2026'],
      ['Start time', '09:30 · Helsinki time'],
      ['Participants', '2 Adults'],
      ['Meeting point', 'Senate Square, Helsinki'],
    );
    if (audience === 'supplier') {
      common.push(
        ['Customer', 'Alex Traveler'],
        ['Customer email', 'alex@example.com'],
        ['Customer phone', '+358401234567'],
      );
    }
  } else if (cat === 'stay') {
    common.push(
      ['Booking reference', 'TV-48302'],
      ['Check-in', '2026-12-01'],
      ['Check-out', '2026-12-04'],
      ['Guests', '2'],
      ['Check-in address', 'Lake Road 12, Inari'],
    );
    if (audience === 'supplier') {
      common.push(['Customer', 'Alex Traveler'], ['Customer email', 'alex@example.com']);
    }
  } else {
    common.push(
      ['Booking reference', 'TV-48315'],
      ['Pickup', '2026-11-20 10:00 Europe/Helsinki'],
      ['Return', '2026-11-22 18:00 Europe/Helsinki'],
      ['Quantity', '1'],
      ['Pickup place', 'Kamppi Camera Desk, Helsinki'],
      ['Return place', 'Kamppi Camera Desk, Helsinki'],
      ['Handover', 'Staff handover'],
    );
    if (audience === 'supplier') {
      common.push(
        ['Customer', 'Alex Traveler'],
        ['Customer email', 'alex@example.com'],
        ['Customer phone', '+358401234567'],
      );
    }
  }
  return common.map(([l, v]) => emailDetailRow(l, v)).join('');
}

function titles(cat: Cat): { title: string; option: string } {
  if (cat === 'tour') return { title: 'Northern Lights Chase', option: 'Small group · English' };
  if (cat === 'stay') return { title: 'Aurora Cabin Inari', option: 'Entire cabin' };
  return { title: 'Sony A7 IV Kit', option: 'Body + 24–70mm' };
}

function customerHtml(cat: Cat): string {
  const { title, option } = titles(cat);
  const product = emailProductBlock({ title, option, imageUrl: IMG });
  const amount = emailAmountBlock({
    label: 'Amount paid',
    amountLine: cat === 'stay' ? 'EUR 480.00' : cat === 'rental' ? 'EUR 189.00' : 'EUR 238.00',
    status: 'Paid',
  });
  return transactionalEmailDocument({
    headline: 'Your booking is confirmed!',
    statusChip: 'Booking confirmed',
    introHtml: `<p style="margin:0;color:${EMAIL_THEME.muted};">Hi Alex, your Traverion booking is confirmed. Details and next steps are below.</p><p style="margin:8px 0 0;font-size:13px;color:${EMAIL_THEME.faint};">A payment receipt is attached as a PDF.</p>`,
    bodyHtml: `${product}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${EMAIL_THEME.divider};">${rowsFor(cat, 'customer')}</table>${amount}`,
    ctaUrl: 'https://www.traverion.com/trips',
    ctaLabel: 'View your booking',
    footerNote:
      'Your booking details and updates are available in Trips. Traverion does not treat email delivery as proof you received a notice.',
    siteUrl: 'https://www.traverion.com',
  });
}

function supplierHtml(cat: Cat): string {
  const { title, option } = titles(cat);
  const product = emailProductBlock({ title, option, imageUrl: IMG });
  const amount = emailAmountBlock({
    label: 'Booking value',
    amountLine: cat === 'stay' ? 'EUR 480.00' : cat === 'rental' ? 'EUR 189.00' : 'EUR 238.00',
    status: 'Gross customer amount · payout details are in Income',
  });
  return transactionalEmailDocument({
    headline: 'New booking confirmed',
    statusChip: 'Paid',
    introHtml: `<p style="margin:0;color:${EMAIL_THEME.muted};">Payment is confirmed. The booking details are below.</p>`,
    bodyHtml: `${product}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${EMAIL_THEME.divider};">${rowsFor(cat, 'supplier')}</table>${amount}`,
    ctaUrl: 'https://partner.traverion.com/partner/bookings',
    ctaLabel: 'View booking',
    siteUrl: 'https://www.traverion.com',
  });
}

async function writePdfs() {
  // Local Node import — edge copy uses npm: specifier.
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const samples: Array<{
    file: string;
    kind: string;
    title: string;
    option: string;
    bookingDate: string;
    checkOutDate?: string;
    partyLabel: string;
    amount: number;
  }> = [
    {
      file: 'receipt-tour.pdf',
      kind: 'tour',
      title: 'Northern Lights Chase',
      option: 'Small group · English',
      bookingDate: '2026-11-15',
      partyLabel: '2 Adults',
      amount: 238,
    },
    {
      file: 'receipt-stay.pdf',
      kind: 'stay',
      title: 'Aurora Cabin Inari',
      option: 'Entire cabin',
      bookingDate: '2026-12-01',
      checkOutDate: '2026-12-04',
      partyLabel: '2',
      amount: 480,
    },
    {
      file: 'receipt-rental.pdf',
      kind: 'rental',
      title: 'Sony A7 IV Kit',
      option: 'Body + 24–70mm',
      bookingDate: '2026-11-20 10:00 Europe/Helsinki',
      checkOutDate: '2026-11-22 18:00 Europe/Helsinki',
      partyLabel: '1',
      amount: 189,
    },
  ];

  for (const s of samples) {
    // Inline a minimal rebuild matching receipt-pdf.ts (avoid Deno npm: import).
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const body = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const blue = rgb(0.043, 0.227, 0.51);
    const ink = rgb(0.1, 0.12, 0.16);
    const muted = rgb(0.38, 0.42, 0.48);
    const rule = rgb(0.86, 0.88, 0.91);
    const x = 48;
    const right = 547;
    let y = 780;
    const draw = (text: string, size: number, font = body, color = ink) => {
      page.drawText(text, { x, y, size, font, color });
      y -= size + 10;
    };
    const kv = (label: string, value: string) => {
      page.drawText(label, { x, y, size: 10, font: body, color: muted });
      page.drawText(value.slice(0, 62), { x: 168, y, size: 10, font: bold, color: ink });
      y -= 16;
    };
    const ruleLine = () => {
      y -= 4;
      page.drawLine({ start: { x, y }, end: { x: right, y }, thickness: 0.75, color: rule });
      y -= 14;
    };
    draw('TRAVERION', 11, bold, blue);
    draw('Payment receipt', 20, bold, ink);
    ruleLine();
    page.drawText('Booking reference', { x, y, size: 9, font: body, color: muted });
    y -= 13;
    draw(s.kind === 'tour' ? 'TV-48291' : s.kind === 'stay' ? 'TV-48302' : 'TV-48315', 14, bold, ink);
    page.drawText(`Document ID  R-${s.kind === 'tour' ? '48291' : s.kind === 'stay' ? '48302' : '48315'}`, {
      x,
      y,
      size: 9,
      font: body,
      color: muted,
    });
    y -= 14;
    ruleLine();
    kv('Customer', 'Alex Traveler');
    kv('Email', 'alex@example.com');
    kv(s.kind === 'stay' ? 'Stay' : s.kind === 'rental' ? 'Rental' : 'Tour', s.title);
    kv('Option', s.option);
    if (s.kind === 'stay') {
      kv('Check-in', s.bookingDate);
      kv('Check-out', s.checkOutDate!);
      kv('Guests', s.partyLabel);
    } else if (s.kind === 'rental') {
      kv('Pickup', s.bookingDate);
      kv('Return', s.checkOutDate!);
      kv('Quantity', s.partyLabel);
    } else {
      kv('Date', s.bookingDate);
      kv('Participants', s.partyLabel);
    }
    ruleLine();
    page.drawText('Amount paid', { x, y, size: 10, font: body, color: muted });
    y -= 16;
    page.drawText(`EUR ${s.amount.toFixed(2)}`, { x, y, size: 22, font: bold, color: blue });
    y -= 28;
    page.drawText('Payment status  Paid', { x, y, size: 10, font: body, color: muted });
    y -= 16;
    kv('Payment reference', 'pi_3PreviewExample0001');
    ruleLine();
    draw('Issued by Traverion for this paid booking.', 9, body, muted);
    draw('Tax treatment follows the payment and marketplace records for this booking.', 9, body, muted);
    y -= 8;
    draw('Thank you for booking with Traverion.', 10, body, muted);
    draw('Support · traverion.com/contact', 9, body, blue);
    writeFileSync(join(outDir, s.file), await doc.save());
  }
}

const cats: Cat[] = ['tour', 'stay', 'rental'];
for (const cat of cats) {
  writeFileSync(join(outDir, `customer-${cat}.html`), customerHtml(cat));
  writeFileSync(join(outDir, `supplier-${cat}.html`), supplierHtml(cat));
}
await writePdfs();

writeFileSync(
  join(outDir, 'REPORT.md'),
  `# Premium booking emails & PDF receipts

## Design
- Emails: dark \`#101318\` / \`#1C222C\`, white text, Traverion blue accents (\`transactional-html.ts\`).
- PDFs: white A4, dark text, blue amount (\`receipt-pdf.ts\`).

## Category terminology
- Tours: Date, Start time, Participants, Meeting point / Pickup
- Stays: Check-in / Check-out, Guests, property address
- Rentals: Pickup / Return **with times**, Quantity (never Guests), handover method

## Financial rules
- Supplier emails show **Booking value** = gross customer amount only
- No commission / net earnings in notification emails
- Customer emails + PDFs show amount paid; no supplier payout internals
- VAT not invented — seller line only when known

## Delivery (preserved)
- Resend + idempotency claim/record
- PDF attached on \`booking_confirmed_paid\`
- Supplier new_booking re-derives gross from \`amount_paid\`

## Previews in this folder
- customer-{tour,stay,rental}.html
- supplier-{tour,stay,rental}.html
- receipt-{tour,stay,rental}.pdf
`
);

console.log(`Wrote previews to ${outDir}`);
