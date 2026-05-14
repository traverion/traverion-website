// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  escapeHtml,
  fieldDiffPlainText,
  fieldDiffTableHtml,
  type FieldDiff,
} from '../_shared/transactional-html.ts';
import { buildReceiptPdfBytes, uint8ToBase64 } from '../_shared/receipt-pdf.ts';

type EmailKind =
  | 'booking_request'
  | 'booking_confirmed_paid'
  | 'your_details_updated'
  | 'host_updated_schedule'
  | 'booking_cancelled';

type Payload = {
  customerEmail: string;
  customerName?: string;
  listingTitle?: string;
  bookingId?: string;
  /** Global sequential order number (50 = 50th booking ever); shown as #50. */
  bookingNumber?: number;
  bookingDate?: string;
  guests?: number;
  totalAmount?: number;
  currency?: string;
  /** Stripe PaymentIntent id (printed on PDF receipt). */
  paymentIntentId?: string;
  /** ISO timestamp when payment completed (PDF). */
  paidAtIso?: string;
  /** Defaults to booking_request when omitted (backwards compatible). */
  emailKind?: EmailKind;
  /** For update emails: show previous vs new (e.g. place of stay, pickup time). */
  fieldDiffs?: FieldDiff[];
  /** Public traveler site base, no trailing slash (e.g. https://www.traverion.com). */
  publicSiteUrl?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function siteBase(raw?: string): string {
  return (raw ?? 'https://www.traverion.com').replace(/\/$/, '');
}

function wrapCustomerDocument(params: {
  headline: string;
  intro: string;
  detailRowsHtml: string;
  extraHtml: string;
  publicSiteUrl: string;
  footerNote?: string;
}): string {
  const base = siteBase(params.publicSiteUrl);
  const bookingsUrl = `${base}/bookings`;
  const logo = `${base}/traverionlogotransparent.png?v=3`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:24px 28px 12px;text-align:center;">
<img src="${logo}" width="180" height="auto" alt="Traverion" style="display:block;margin:0 auto;max-width:85%;height:auto;border:0;"/>
</td></tr>
<tr><td style="padding:8px 32px 4px;font-size:20px;font-weight:700;color:#003580;">${escapeHtml(params.headline)}</td></tr>
<tr><td style="padding:8px 32px 16px;font-size:15px;line-height:1.6;color:#374151;">${params.intro}</td></tr>
<tr><td style="padding:0 32px 8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb;padding-top:12px;">
${params.detailRowsHtml}
</table>
</td></tr>
<tr><td style="padding:8px 32px 24px;font-size:14px;line-height:1.6;color:#374151;">
${params.extraHtml}
${params.footerNote ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">${params.footerNote}</p>` : ''}
<p style="margin:20px 0 0;"><a href="${bookingsUrl}" style="display:inline-block;padding:12px 20px;background:#003580;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View my bookings</a></p>
</td></tr>
</table>
<p style="font-size:12px;color:#9ca3af;margin-top:16px;">You are receiving this about a Traverion booking. <a href="${base}" style="color:#003580;">traverion.com</a></p>
</td></tr></table></body></html>`;
}

function detailRow(label: string, value: string): string {
  if (!value) return '';
  return `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:130px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(value)}</td></tr>`;
}

function orderTag(n: number | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
}

function buildDetailRows(p: Payload): string {
  const title = String(p.listingTitle ?? 'Your experience').trim() || 'Your experience';
  const rows: string[] = [];
  const ref = orderTag(p.bookingNumber);
  rows.push(detailRow('Experience', title));
  if (ref) rows.push(detailRow('Booking number', `#${ref}`));
  if (p.bookingDate) rows.push(detailRow('Date', p.bookingDate));
  if (typeof p.guests === 'number' && p.guests > 0) rows.push(detailRow('Guests', String(p.guests)));
  if (!ref && p.bookingId) rows.push(detailRow('Internal id', p.bookingId));
  return rows.join('');
}

function subjectForKind(kind: EmailKind, title: string, refDigits?: string): string {
  const t = title.trim() || 'Your booking';
  const tag = refDigits ? `#${refDigits} — ` : '';
  switch (kind) {
    case 'booking_confirmed_paid':
      return `${tag}Confirmed & paid: ${t}`;
    case 'your_details_updated':
      return `${tag}We saved your booking details — ${t}`;
    case 'host_updated_schedule':
      return `${tag}Updated meeting times — ${t}`;
    case 'booking_cancelled':
      return `${tag}Booking cancelled — ${t}`;
    default:
      return `${tag}Booking received — ${t}`;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('CUSTOMER_BOOKING_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';
    if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);

    const body = (await req.json()) as Payload;
    const to = String(body.customerEmail ?? '').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ success: false, error: 'Invalid customer email' }, 400);
    }

    const kind: EmailKind = body.emailKind ?? 'booking_request';
    const title = String(body.listingTitle ?? 'Your booking').trim() || 'Your booking';
    const name = String(body.customerName ?? '').trim();
    const greeting = name ? `Hi ${name},` : 'Hi,';
    const publicSiteUrl = siteBase(body.publicSiteUrl);
    const currency = String(body.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const refDigits = orderTag(body.bookingNumber);
    const amount =
      typeof body.totalAmount === 'number' && Number.isFinite(body.totalAmount) && body.totalAmount >= 0
        ? body.totalAmount
        : undefined;

    const diffs = Array.isArray(body.fieldDiffs)
      ? body.fieldDiffs.filter(
          (d) =>
            d &&
            typeof d.label === 'string' &&
            typeof d.before === 'string' &&
            typeof d.after === 'string',
        )
      : [];

    let headline = 'Booking update';
    let intro = '';
    let extraHtml = '';
    let footerNote: string | undefined;

    if (kind === 'booking_confirmed_paid') {
      headline = 'Your booking is confirmed';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Thank you — your payment was successful and your reservation is <strong>confirmed</strong>. Below is your receipt summary.</p>`;
      if (refDigits) {
        intro += `<p style="margin:12px 0 0;font-size:14px;color:#111827;">Booking number: <strong>#${escapeHtml(refDigits)}</strong></p><p style="margin:8px 0 0;font-size:13px;color:#4b5563;">A printable receipt is attached as a PDF.</p>`;
      }
      if (typeof amount === 'number') {
        extraHtml = `<table role="presentation" style="margin:12px 0 0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;width:100%;">
<tr><td style="font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Payment receipt</td></tr>
<tr><td style="font-size:22px;font-weight:700;color:#14532d;padding-top:4px;">${escapeHtml(currency)} ${amount.toFixed(2)}</td></tr>
<tr><td style="font-size:13px;color:#15803d;padding-top:6px;">Charged for this experience. Keep this email for your records.</td></tr>
</table>`;
      }
      footerNote =
        'The experience provider may follow up by email about meeting point, pickup, or what to bring.';
    } else if (kind === 'your_details_updated') {
      headline = 'Your booking details were saved';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">We updated the notes on your booking. Here is what changed (previous value → new value):</p>`;
      extraHtml = fieldDiffTableHtml(diffs);
      footerNote = 'If you did not make this change, contact the provider or Traverion support immediately.';
    } else if (kind === 'host_updated_schedule') {
      headline = 'Your host updated meeting times';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">The experience provider updated the schedule for your booking. Compare the previous and new times below.</p>`;
      extraHtml = fieldDiffTableHtml(diffs);
      footerNote = 'Please arrive on time for the updated pickup or start time. Reply to the provider if you need help.';
    } else if (kind === 'booking_cancelled') {
      headline = 'Your booking was cancelled';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your reservation has been cancelled as requested. Summary below.</p>`;
      if (diffs.length) extraHtml = fieldDiffTableHtml(diffs);
      footerNote = 'Refund timing depends on your payment method and bank. If you paid by card, look for a reversal from Traverion or your card statement.';
    } else {
      headline = 'We received your booking request';
      intro = `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p><p style="margin:0;">Your request is recorded for <strong>${escapeHtml(title)}</strong>. Complete payment when prompted in the app, or wait for confirmation if no payment is required.</p>`;
      if (typeof amount === 'number') {
        extraHtml = `<p style="margin:0;font-size:14px;color:#374151;"><strong>Quoted total:</strong> ${escapeHtml(currency)} ${amount.toFixed(2)}</p>`;
      }
      footerNote = 'You will receive another email when your booking is confirmed and paid (if applicable).';
    }

    const detailRows = buildDetailRows(body);
    const html = wrapCustomerDocument({
      headline,
      intro,
      detailRowsHtml: detailRows,
      extraHtml,
      publicSiteUrl,
      footerNote,
    });

    const textParts: string[] = [greeting, '', subjectForKind(kind, title, refDigits || undefined), ''];
    if (refDigits) textParts.push(`Booking #: ${refDigits}`);
    if (body.bookingDate) textParts.push(`Date: ${body.bookingDate}`);
    if (typeof body.guests === 'number') textParts.push(`Guests: ${body.guests}`);
    if (!refDigits && body.bookingId) textParts.push(`Reference: ${body.bookingId}`);
    if (typeof amount === 'number' && kind === 'booking_confirmed_paid') {
      textParts.push('', `Payment receipt: ${currency} ${amount.toFixed(2)}`);
    }
    if (kind === 'booking_confirmed_paid' && refDigits) {
      textParts.push('', 'A PDF receipt is attached to this email.');
    }
    if (diffs.length) {
      textParts.push('', fieldDiffPlainText(diffs));
    }
    textParts.push('', `View bookings: ${publicSiteUrl}/bookings`, '', '— Traverion');
    const text = textParts.filter(Boolean).join('\n');

    const attachments: { filename: string; content: string }[] = [];
    if (kind === 'booking_confirmed_paid' && refDigits && typeof amount === 'number') {
      try {
        const pdfBytes = await buildReceiptPdfBytes({
          bookingNumber: Number(refDigits),
          guestName: name || undefined,
          listingTitle: title,
          bookingDate: body.bookingDate,
          guests: typeof body.guests === 'number' ? body.guests : undefined,
          amountPaid: amount,
          currency,
          paidAtIso: body.paidAtIso,
          paymentIntentId: body.paymentIntentId,
        });
        attachments.push({
          filename: `Traverion-receipt-${refDigits}.pdf`,
          content: uint8ToBase64(pdfBytes),
        });
      } catch {
        /* still send confirmation email without attachment */
      }
    }

    const resendPayload: Record<string, unknown> = {
      from: fromEmail,
      to: [to],
      subject: subjectForKind(kind, title, refDigits || undefined),
      text,
      html,
    };
    if (attachments.length) resendPayload.attachments = attachments;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });
    const resendJson: any = await resendResp.json();
    if (!resendResp.ok) return json({ success: false, error: resendJson?.message ?? 'Resend error' }, 500);
    return json({ success: true, providerMessageId: resendJson?.id ?? null });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
