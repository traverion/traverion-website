import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

export type ReceiptPdfInput = {
  /** App-wide sequential order number (no # prefix) */
  bookingNumber: number;
  guestName?: string;
  listingTitle: string;
  bookingDate?: string;
  guests?: number;
  amountPaid: number;
  currency: string;
  paidAtIso?: string;
  paymentIntentId?: string;
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Single-page payment receipt PDF (UTF-8 basic Latin). */
export async function buildReceiptPdfBytes(input: ReceiptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const x = 50;
  const draw = (text: string, size: number, font = body, color = rgb(0.12, 0.14, 0.18)) => {
    page.drawText(text, { x, y, size, font, color });
    y -= size + 11;
  };

  draw('Traverion', 11, body, rgb(0.2, 0.35, 0.55));
  draw('Payment receipt', 18, bold);
  y -= 4;
  draw(`Booking #${input.bookingNumber}`, 13, bold);
  y -= 6;

  const name = (input.guestName ?? '').trim();
  if (name) draw(`Guest: ${clip(name, 70)}`, 11);

  draw(`Experience: ${clip(input.listingTitle, 72)}`, 11);
  if (input.bookingDate) draw(`Date: ${input.bookingDate}`, 11);
  if (typeof input.guests === 'number' && input.guests > 0) draw(`Guests: ${input.guests}`, 11);

  y -= 10;
  const cur = (input.currency ?? 'USD').trim().toUpperCase() || 'USD';
  const amt = Number.isFinite(input.amountPaid) ? input.amountPaid.toFixed(2) : '—';
  draw(`Amount paid: ${cur} ${amt}`, 14, bold, rgb(0.05, 0.45, 0.2));

  if (input.paidAtIso) {
    try {
      const d = new Date(input.paidAtIso);
      draw(`Paid at: ${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`, 9, body, rgb(0.35, 0.38, 0.42));
    } catch {
      /* ignore */
    }
  }
  if (input.paymentIntentId) {
    draw(`Payment reference: ${clip(input.paymentIntentId, 64)}`, 9, body, rgb(0.35, 0.38, 0.42));
  }

  y -= 24;
  draw('Thank you for booking with Traverion.', 10, body, rgb(0.35, 0.38, 0.42));
  draw('Please keep this receipt for your records.', 10, body, rgb(0.35, 0.38, 0.42));

  return new Uint8Array(await doc.save());
}

export function uint8ToBase64(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}
