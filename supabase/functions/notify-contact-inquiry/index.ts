// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  adminClientFromEnv,
  claimTransactionalSend,
  recordTransactionalSend,
  sendResendEmail,
} from '../_shared/transactional-email.ts';

/**
 * Phase 1051: ops email for contact / affiliate / content-creator inquiries.
 *
 * BEFORE: body fields (name/email/subject/message) were trusted verbatim with
 * verify_jwt=false — anyone could spam ops@ with forged content without a
 * contact_inquiries row.
 *
 * AFTER: require inquiryId; load the row with service role; send from DB truth
 * only. Idempotent per inquiryId. Cooldown: same email cannot trigger more than
 * one ops notify per 15 minutes (entity_id = lowercased email).
 *
 * Client: src/data/supabase-contact.ts inserts first, then invokes with inquiryId.
 *
 * Env: RESEND_API_KEY, CONTACT_INQUIRY_TO, CONTACT_EMAIL_FROM / SUPPLIER_EMAIL_FROM,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

    const admin = adminClientFromEnv();
    if (!admin) {
      return json({ success: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const inquiryId = String(body.inquiryId ?? body.inquiry_id ?? '').trim();
    if (!inquiryId) {
      return json({ success: false, error: 'inquiryId required' }, 400);
    }

    const { data: row, error: rowErr } = await admin
      .from('contact_inquiries')
      .select('id, name, email, phone, subject, message, inquiry_type')
      .eq('id', inquiryId)
      .maybeSingle();
    if (rowErr) {
      return json({ success: false, error: rowErr.message }, 500);
    }
    if (!row) {
      return json({ success: false, error: 'Inquiry not found' }, 404);
    }

    const name = String(row.name ?? '').trim();
    const email = String(row.email ?? '').trim();
    const phone = String(row.phone ?? '').trim();
    const subject = String(row.subject ?? '').trim();
    const message = String(row.message ?? '').trim();
    const inquiryType = String(row.inquiry_type ?? 'general').trim();
    if (!name || !email || !subject || !message) {
      return json({ success: false, error: 'Inquiry row incomplete' }, 400);
    }

    const emailKey = email.toLowerCase();
    const idempotencyKey = `contact_inquiry:${inquiryId}`;
    const claim = await claimTransactionalSend(admin, {
      idempotencyKey,
      channel: 'staff',
      templateKey: 'contact_inquiry',
      entityType: 'contact_email',
      entityId: emailKey,
      cooldownSeconds: 900,
    });
    if (claim.action === 'skip') {
      return json({ success: true, skipped: true, reason: claim.reason });
    }

    const textLines = [
      `Inquiry type: ${inquiryType}`,
      `From: ${name} <${email}>`,
      phone ? `Phone: ${phone}` : '',
      `Inquiry id: ${inquiryId}`,
      '',
      message,
    ].filter(Boolean);

    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111;">
<p><strong>Inquiry type:</strong> ${escapeHtml(inquiryType)}</p>
<p><strong>From:</strong> ${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>&gt;</p>
${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
<p style="color:#6b7280;font-size:12px;">Inquiry id: ${escapeHtml(inquiryId)}</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
<p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
</body></html>`;

    const send = await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: [toEmail],
      replyTo: email,
      subject: subject.slice(0, 998),
      text: textLines.join('\n'),
      html,
    });

    // entity_type/id must match claim cooldown keys (per submitter email).
    // Inquiry id remains in idempotency_key + email body.
    if (!send.ok) {
      await recordTransactionalSend(admin, {
        idempotencyKey,
        channel: 'staff',
        templateKey: 'contact_inquiry',
        recipientEmail: toEmail,
        entityType: 'contact_email',
        entityId: emailKey,
        status: 'failed',
        errorMessage: send.error ?? 'Resend error',
      });
      return json({ success: false, error: send.error ?? 'Resend error' }, 500);
    }

    await recordTransactionalSend(admin, {
      idempotencyKey,
      channel: 'staff',
      templateKey: 'contact_inquiry',
      recipientEmail: toEmail,
      entityType: 'contact_email',
      entityId: emailKey,
      providerMessageId: send.id ?? null,
      status: 'sent',
    });

    return json({ success: true, providerMessageId: send.id ?? null });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
