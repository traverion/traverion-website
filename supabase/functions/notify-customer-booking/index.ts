// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type Payload = {
  customerEmail: string;
  customerName?: string;
  listingTitle?: string;
  bookingId?: string;
  bookingDate?: string;
  guests?: number;
  totalAmount?: number;
  currency?: string;
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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

    const title = String(body.listingTitle ?? 'Your booking').trim() || 'Your booking';
    const name = String(body.customerName ?? '').trim();
    const bookingDate = String(body.bookingDate ?? '').trim();
    const bookingId = String(body.bookingId ?? '').trim();
    const guests = typeof body.guests === 'number' && body.guests > 0 ? body.guests : undefined;
    const amount =
      typeof body.totalAmount === 'number' && Number.isFinite(body.totalAmount) && body.totalAmount >= 0
        ? body.totalAmount
        : undefined;
    const currency = String(body.currency ?? 'USD').trim() || 'USD';

    const greeting = name ? `Hi ${name},` : 'Hi,';
    const lines = [
      greeting,
      '',
      `Your booking request was received for: ${title}`,
      bookingDate ? `Date: ${bookingDate}` : '',
      typeof guests === 'number' ? `Guests: ${guests}` : '',
      bookingId ? `Booking reference: ${bookingId}` : '',
      typeof amount === 'number' ? `Estimated total: ${currency} ${amount}` : '',
      '',
      'The provider will review your request and contact you by email.',
      '',
      '— Traverion',
    ].filter(Boolean);

    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>${esc(greeting)}</p>
<p>Your booking request was received for: <strong>${esc(title)}</strong></p>
<ul>
${bookingDate ? `<li>Date: ${esc(bookingDate)}</li>` : ''}
${typeof guests === 'number' ? `<li>Guests: ${guests}</li>` : ''}
${bookingId ? `<li>Booking reference: ${esc(bookingId)}</li>` : ''}
${typeof amount === 'number' ? `<li>Estimated total: ${esc(currency)} ${amount}</li>` : ''}
</ul>
<p>The provider will review your request and contact you by email.</p>
<p>— Traverion</p>
</body></html>`;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: `Booking received: ${title}`,
        text: lines.join('\n'),
        html,
      }),
    });
    const resendJson: any = await resendResp.json();
    if (!resendResp.ok) return json({ success: false, error: resendJson?.message ?? 'Resend error' }, 500);
    return json({ success: true, providerMessageId: resendJson?.id ?? null });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
