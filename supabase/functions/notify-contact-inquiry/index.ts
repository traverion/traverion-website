// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

/**
 * Sends a copy of a contact / affiliate / content-creator inquiry to operations email (Resend).
 * Client calls after row insert into contact_inquiries; DB remains source of truth.
 *
 * Env: RESEND_API_KEY, CONTACT_INQUIRY_TO (default info@traverion.com),
 *      CONTACT_EMAIL_FROM or SUPPLIER_EMAIL_FROM for From header.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MAX = { name: 200, email: 320, phone: 80, subject: 500, message: 6000 };

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
    const fromEmail =
      Deno.env.get('CONTACT_EMAIL_FROM') ??
      Deno.env.get('SUPPLIER_EMAIL_FROM') ??
      'Traverion <no-reply@traverion.com>';
    const toEmail = (Deno.env.get('CONTACT_INQUIRY_TO') ?? 'info@traverion.com').trim();
    if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);

    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();
    const inquiryType = String(body.inquiry_type ?? 'general').trim();

    if (!name || name.length > MAX.name) return json({ success: false, error: 'Invalid name' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > MAX.email) {
      return json({ success: false, error: 'Invalid email' }, 400);
    }
    if (!subject || subject.length > MAX.subject) return json({ success: false, error: 'Invalid subject' }, 400);
    if (!message || message.length > MAX.message) return json({ success: false, error: 'Invalid message' }, 400);
    const phoneNorm = phone ? phone.slice(0, MAX.phone) : '';

    const textLines = [
      `Inquiry type: ${inquiryType}`,
      `From: ${name} <${email}>`,
      phoneNorm ? `Phone: ${phoneNorm}` : '',
      '',
      message,
    ].filter(Boolean);

    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111;">
<p><strong>Inquiry type:</strong> ${escapeHtml(inquiryType)}</p>
<p><strong>From:</strong> ${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>&gt;</p>
${phoneNorm ? `<p><strong>Phone:</strong> ${escapeHtml(phoneNorm)}</p>` : ''}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
<p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
</body></html>`;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: subject.slice(0, 998),
        text: textLines.join('\n'),
        html,
      }),
    });
    const resendJson: any = await resendResp.json();
    if (!resendResp.ok) {
      return json({ success: false, error: resendJson?.message ?? 'Resend error' }, 500);
    }
    return json({ success: true, providerMessageId: resendJson?.id ?? null });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
