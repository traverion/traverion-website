import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

export type ReceiptPdfInput = {
  /** App-wide sequential order number (document id / internal receipt number). */
  bookingNumber: number;
  /** Customer-facing TV- reference. Preferred over Booking #N. */
  publicReference?: string;
  guestName?: string;
  guestEmail?: string;
  listingTitle: string;
  optionLabel?: string;
  bookingDate?: string;
  /** Phase 1576: exclusive stay check-out when listingKind is stay. */
  checkOutDate?: string;
  listingKind?: string;
  /** Tour participants / stay guests / rental quantity — already labeled by caller. */
  partyLabel?: string;
  guests?: number;
  amountPaid: number;
  currency: string;
  paidAtIso?: string;
  paymentIntentId?: string;
  /** Optional seller line — only when known; never invent VAT. */
  sellerLine?: string;
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function kindLabel(kind: string | undefined): string {
  const k = String(kind ?? '').trim().toLowerCase();
  if (k === 'stay') return 'Stay';
  if (k === 'rental') return 'Rental';
  return 'Tour';
}

function partyFallbackLabel(kind: string | undefined): string {
  const k = String(kind ?? '').trim().toLowerCase();
  if (k === 'rental') return 'Quantity';
  if (k === 'stay') return 'Guests';
  return 'Participants';
}

/** Single-page payment receipt PDF — white, professional, Traverion-branded. */
export async function buildReceiptPdfBytes(input: ReceiptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.043, 0.227, 0.51); // #0b3a82
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.38, 0.42, 0.48);
  const rule = rgb(0.86, 0.88, 0.91);
  const x = 48;
  const right = 547;
  let y = 780;

  const draw = (text: string, size: number, font = body, color = ink, atX = x) => {
    page.drawText(text, { x: atX, y, size, font, color });
    y -= size + 10;
  };

  const ruleLine = (gap = 14) => {
    y -= 4;
    page.drawLine({
      start: { x, y },
      end: { x: right, y },
      thickness: 0.75,
      color: rule,
    });
    y -= gap;
  };

  const kv = (label: string, value: string) => {
    if (!value.trim()) return;
    page.drawText(label, { x, y, size: 10, font: body, color: muted });
    page.drawText(clip(value, 62), { x: 168, y, size: 10, font: bold, color: ink });
    y -= 16;
  };

  // Header
  draw('TRAVERION', 11, bold, blue);
  draw('Payment receipt', 20, bold, ink);
  y -= 2;
  ruleLine(16);

  const publicRef = (input.publicReference ?? '').trim();
  const receiptId =
    publicRef ||
    (Number.isFinite(input.bookingNumber) && input.bookingNumber > 0
      ? `TV-${Math.floor(input.bookingNumber)}`
      : '');
  if (receiptId) {
    page.drawText('Booking reference', { x, y, size: 9, font: body, color: muted });
    y -= 13;
    draw(clip(receiptId, 40), 14, bold, ink);
  }
  if (Number.isFinite(input.bookingNumber) && input.bookingNumber > 0) {
    page.drawText(`Document ID  R-${Math.floor(input.bookingNumber)}`, {
      x,
      y,
      size: 9,
      font: body,
      color: muted,
    });
    y -= 14;
  }

  // Phase 1576: stays print Check-in / Check-out (HTML email parity); tours keep Date.
  const checkOut = String(input.checkOutDate ?? '').trim();
  const isStay = String(input.listingKind ?? '').toLowerCase() === 'stay';
  const isRental = String(input.listingKind ?? '').toLowerCase() === 'rental';

  ruleLine(14);

  kv('Customer', clip(input.guestName ?? '', 70));
  if ((input.guestEmail ?? '').trim()) kv('Email', clip(input.guestEmail!.trim(), 70));
  kv(kindLabel(input.listingKind), clip(input.listingTitle, 70));
  if ((input.optionLabel ?? '').trim()) kv('Option', clip(input.optionLabel!.trim(), 70));

  if (isStay && input.bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    kv('Check-in', input.bookingDate);
    kv('Check-out', checkOut);
  } else if (isRental && input.bookingDate) {
    kv('Pickup', clip(input.bookingDate, 62));
    if (checkOut) kv('Return', clip(checkOut, 62));
  } else if (input.bookingDate) {
    kv('Date', input.bookingDate);
  }

  const party = (input.partyLabel ?? '').trim();
  if (party) {
    kv(partyFallbackLabel(input.listingKind), clip(party, 70));
  } else if (typeof input.guests === 'number' && input.guests > 0) {
    kv(partyFallbackLabel(input.listingKind), String(input.guests));
  }

  ruleLine(18);

  const cur = (input.currency ?? 'EUR').trim().toUpperCase() || 'EUR';
  const amt = Number.isFinite(input.amountPaid) ? input.amountPaid.toFixed(2) : '—';
  page.drawText('Amount paid', { x, y, size: 10, font: body, color: muted });
  y -= 16;
  page.drawText(`${cur} ${amt}`, { x, y, size: 22, font: bold, color: blue });
  y -= 28;
  page.drawText('Payment status  Paid', { x, y, size: 10, font: body, color: muted });
  y -= 16;

  if (input.paidAtIso) {
    try {
      const d = new Date(input.paidAtIso);
      kv('Receipt date', `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`);
    } catch {
      /* ignore */
    }
  }
  if (input.paymentIntentId) {
    kv('Payment reference', clip(input.paymentIntentId, 54));
  }

  ruleLine(16);

  const seller = (input.sellerLine ?? '').trim();
  if (seller) {
    draw(clip(seller, 90), 9, body, muted);
  } else {
    draw('Issued by Traverion for this paid booking.', 9, body, muted);
    draw('Tax treatment follows the payment and marketplace records for this booking.', 9, body, muted);
  }

  y -= 8;
  draw('Thank you for booking with Traverion.', 10, body, muted);
  draw('Keep this receipt for your records. Manage the booking in My bookings.', 10, body, muted);
  draw('Support · traverion.com/contact', 9, body, blue);

  return new Uint8Array(await doc.save());
}

export function uint8ToBase64(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}
