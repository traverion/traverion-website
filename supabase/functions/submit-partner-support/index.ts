// deno-lint-ignore-file no-explicit-any
/**
 * Authenticated Partner Support Center submission.
 * Persists a request row, emails info@traverion.com (Reply-To = supplier),
 * and sends a short confirmation to the supplier.
 *
 * Env: RESEND_API_KEY, CONTACT_INQUIRY_TO / PARTNER_SUPPORT_TO (default info@traverion.com),
 *      CONTACT_EMAIL_FROM / SUPPLIER_EMAIL_FROM, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import {
  adminClientFromEnv,
  claimTransactionalSend,
  recordTransactionalSend,
  sendResendEmail,
} from '../_shared/transactional-email.ts';

const REQUEST_TYPES = new Set(['problem', 'help', 'question', 'feature', 'other']);
const RELATED_AREAS = new Set([
  'bookings',
  'tours',
  'stays',
  'rentals',
  'listings',
  'availability',
  'pickups',
  'payments',
  'offers',
  'reviews',
  'inbox',
  'account',
  'other',
]);
const TYPE_LABEL: Record<string, string> = {
  problem: 'Report a problem or error',
  help: 'Request help',
  question: 'General question',
  feature: 'Suggest a feature or improvement',
  other: 'Other',
};
const AREA_LABEL: Record<string, string> = {
  bookings: 'Bookings & Reservations',
  tours: 'Tours & Activities',
  stays: 'Stays',
  rentals: 'Rentals',
  listings: 'Listings & Publishing',
  availability: 'Availability & Calendars',
  pickups: 'Pickups',
  payments: 'Payments & Payouts',
  offers: 'Offers & Discounts',
  reviews: 'Reviews',
  inbox: 'Inbox & Messages',
  account: 'Account & Verification',
  other: 'Other',
};
const TYPE_TAG: Record<string, string> = {
  problem: 'Problem',
  help: 'Help',
  question: 'Question',
  feature: 'Feature',
  other: 'Other',
};

const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const COOLDOWN_SECONDS = 120;

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

function sanitizeHeaderValue(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

function referenceCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `PS-${String(n).padStart(6, '0')}`;
}

type AttachmentIn = { filename?: unknown; contentBase64?: unknown; mimeType?: unknown };

function parseAttachments(raw: unknown):
  | { ok: true; files: { filename: string; content: string; mimeType: string }[] }
  | { ok: false; error: string } {
  if (raw == null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Attachments must be a list.' };
  if (raw.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Attach at most ${MAX_ATTACHMENTS} images.` };
  }
  const files: { filename: string; content: string; mimeType: string }[] = [];
  for (const item of raw as AttachmentIn[]) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Invalid attachment.' };
    const mime = String(item.mimeType ?? '').trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return { ok: false, error: 'Attachments must be JPG, PNG, or WebP.' };
    }
    let filename = String(item.filename ?? 'attachment').trim().replace(/[^\w.\-()+ ]+/g, '_');
    if (!filename) filename = 'attachment';
    filename = filename.slice(0, 80);
    const ext =
      mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    if (!/\.(jpe?g|png|webp)$/i.test(filename)) filename = `${filename}${ext}`;
    const content = String(item.contentBase64 ?? '').replace(/\s+/g, '');
    if (!content || content.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 64) {
      return { ok: false, error: 'Each attachment must be 2 MB or smaller.' };
    }
    // Rough byte estimate from base64
    const approxBytes = Math.floor((content.length * 3) / 4);
    if (approxBytes > MAX_FILE_BYTES) {
      return { ok: false, error: 'Each attachment must be 2 MB or smaller.' };
    }
    files.push({ filename, content, mimeType: mime });
  }
  return { ok: true, files };
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
    const toEmail = (
      Deno.env.get('PARTNER_SUPPORT_TO') ??
      Deno.env.get('CONTACT_INQUIRY_TO') ??
      'info@traverion.com'
    ).trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!apiKey) return json({ success: false, error: 'Email delivery is not configured.' }, 500);
    if (!supabaseUrl || !anonKey) {
      return json({ success: false, error: 'Server configuration incomplete.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ success: false, error: 'Sign in to send a support request.' }, 401);

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authed.auth.getUser();
    const user = authData?.user;
    if (authError || !user?.id) {
      return json({ success: false, error: 'Sign in to send a support request.' }, 401);
    }
    const replyTo = authUserVerifiedEmail(user);
    if (!replyTo) {
      return json(
        { success: false, error: 'Confirm your email address before contacting Support.' },
        403
      );
    }

    const admin = adminClientFromEnv();
    if (!admin) {
      return json({ success: false, error: 'Server configuration incomplete.' }, 500);
    }

    // Resolve supplier business context (owner profile or team membership).
    let supplierId = user.id;
    let businessName = '';
    const { data: ownProfile } = await admin
      .from('supplier_profiles')
      .select('id, display_name, company_legal_name')
      .eq('id', user.id)
      .maybeSingle();
    if (ownProfile?.id) {
      businessName =
        String(ownProfile.company_legal_name ?? '').trim() ||
        String(ownProfile.display_name ?? '').trim();
    } else {
      const { data: team } = await admin
        .from('supplier_team_members')
        .select('supplier_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const sid = String(team?.supplier_id ?? '').trim();
      if (!sid) {
        return json({ success: false, error: 'Only partner accounts can use Support.' }, 403);
      }
      supplierId = sid;
      const { data: host } = await admin
        .from('supplier_profiles')
        .select('display_name, company_legal_name')
        .eq('id', sid)
        .maybeSingle();
      businessName =
        String(host?.company_legal_name ?? '').trim() ||
        String(host?.display_name ?? '').trim();
    }
    if (!businessName) businessName = 'Partner account';

    const body = (await req.json()) as Record<string, unknown>;
    const clientRequestId = String(body.clientRequestId ?? body.client_request_id ?? '')
      .trim()
      .slice(0, 80);
    if (!/^[0-9a-f-]{8,80}$/i.test(clientRequestId)) {
      return json({ success: false, error: 'Missing request id. Refresh and try again.' }, 400);
    }

    const requestType = String(body.requestType ?? body.request_type ?? '').trim();
    const relatedArea = String(body.relatedArea ?? body.related_area ?? '').trim();
    const subject = sanitizeHeaderValue(String(body.subject ?? ''));
    const message = String(body.message ?? '').trim();
    const pageUrl = String(body.pageUrl ?? body.page_url ?? '').trim().slice(0, 500);

    if (!REQUEST_TYPES.has(requestType)) {
      return json({ success: false, error: 'Choose a request type.' }, 400);
    }
    if (!RELATED_AREAS.has(relatedArea)) {
      return json({ success: false, error: 'Choose what this is related to.' }, 400);
    }
    if (subject.length < 3) {
      return json({ success: false, error: 'Enter a subject (at least 3 characters).' }, 400);
    }
    if (message.length < 10) {
      return json({ success: false, error: 'Enter a message (at least 10 characters).' }, 400);
    }
    if (message.length > 8000) {
      return json({ success: false, error: 'Message is too long (max 8,000 characters).' }, 400);
    }

    const attachmentsParsed = parseAttachments(body.attachments);
    if (!attachmentsParsed.ok) return json({ success: false, error: attachmentsParsed.error }, 400);

    const idempotencyKey = `partner_support:${user.id}:${clientRequestId}`;
    const claim = await claimTransactionalSend(admin, {
      idempotencyKey,
      channel: 'staff',
      templateKey: 'partner_support',
      entityType: 'partner_support_user',
      entityId: user.id,
      cooldownSeconds: COOLDOWN_SECONDS,
    });
    if (claim.action === 'skip') {
      if (claim.reason === 'already_sent') {
        return json({ success: true, skipped: true, reason: 'already_sent' });
      }
      return json(
        {
          success: false,
          error: 'Please wait a couple of minutes before sending another support request.',
        },
        429
      );
    }

    let ref = referenceCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error: insertErr } = await admin.from('partner_support_requests').insert({
        reference_code: ref,
        supplier_id: supplierId,
        submitter_user_id: user.id,
        request_type: requestType,
        related_area: relatedArea,
        subject,
        message,
        page_url: pageUrl || null,
        attachment_names: attachmentsParsed.files.map((f) => f.filename),
      });
      if (!insertErr) break;
      if (insertErr.code === '23505') {
        ref = referenceCode();
        continue;
      }
      console.error('[submit-partner-support] insert failed', insertErr.message);
      return json({ success: false, error: 'Could not save your request. Try again.' }, 500);
    }

    const submittedAt = new Date().toISOString();
    const typeLabel = TYPE_LABEL[requestType] ?? requestType;
    const areaLabel = AREA_LABEL[relatedArea] ?? relatedArea;
    const tag = TYPE_TAG[requestType] ?? 'Support';
    const opsSubject = sanitizeHeaderValue(`[Traverion Support] [${tag}] ${subject}`).slice(0, 200);

    const textLines = [
      `Reference: ${ref}`,
      `Submitted: ${submittedAt}`,
      '',
      '— Supplier —',
      `Business: ${businessName}`,
      `Email: ${replyTo}`,
      `Supplier ID: ${supplierId}`,
      `Submitter user ID: ${user.id}`,
      '',
      '— Classification —',
      `Request type: ${typeLabel}`,
      `Related to: ${areaLabel}`,
      '',
      `Subject: ${subject}`,
      '',
      '— Message —',
      message,
      '',
      pageUrl ? `Page URL: ${pageUrl}` : '',
      attachmentsParsed.files.length
        ? `Attachments: ${attachmentsParsed.files.map((f) => f.filename).join(', ')}`
        : 'Attachments: none',
    ].filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));

    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111;">
<p style="color:#6b7280;font-size:12px;">Reference <strong>${escapeHtml(ref)}</strong> · ${escapeHtml(submittedAt)}</p>
<h2 style="font-size:15px;margin:16px 0 8px;">Supplier</h2>
<p><strong>Business:</strong> ${escapeHtml(businessName)}<br/>
<strong>Email:</strong> <a href="mailto:${escapeHtml(replyTo)}">${escapeHtml(replyTo)}</a><br/>
<strong>Supplier ID:</strong> ${escapeHtml(supplierId)}<br/>
<strong>Submitter user ID:</strong> ${escapeHtml(user.id)}</p>
<h2 style="font-size:15px;margin:16px 0 8px;">Classification</h2>
<p><strong>Request type:</strong> ${escapeHtml(typeLabel)}<br/>
<strong>Related to:</strong> ${escapeHtml(areaLabel)}</p>
<h2 style="font-size:15px;margin:16px 0 8px;">Subject</h2>
<p>${escapeHtml(subject)}</p>
<h2 style="font-size:15px;margin:16px 0 8px;">Message</h2>
<p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
${pageUrl ? `<p><strong>Page URL:</strong> ${escapeHtml(pageUrl)}</p>` : ''}
${
  attachmentsParsed.files.length
    ? `<p><strong>Attachments:</strong> ${escapeHtml(attachmentsParsed.files.map((f) => f.filename).join(', '))}</p>`
    : ''
}
</body></html>`;

    const resendAttachments = attachmentsParsed.files.map((f) => ({
      filename: f.filename,
      content: f.content,
    }));

    const opsSend = await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: [toEmail],
      replyTo,
      subject: opsSubject,
      text: textLines.join('\n'),
      html,
      attachments: resendAttachments.length ? resendAttachments : undefined,
    });

    if (!opsSend.ok) {
      console.error('[submit-partner-support] ops email failed', opsSend.error);
      await recordTransactionalSend(admin, {
        idempotencyKey,
        channel: 'staff',
        templateKey: 'partner_support',
        recipientEmail: toEmail,
        entityType: 'partner_support_user',
        entityId: user.id,
        status: 'failed',
        errorMessage: opsSend.error ?? 'Resend error',
      });
      return json(
        { success: false, error: 'Could not deliver your request. Try again in a moment.' },
        500
      );
    }

    await recordTransactionalSend(admin, {
      idempotencyKey,
      channel: 'staff',
      templateKey: 'partner_support',
      recipientEmail: toEmail,
      entityType: 'partner_support_user',
      entityId: user.id,
      providerMessageId: opsSend.id ?? null,
      status: 'sent',
    });

    // Confirmation to supplier (best-effort; ops email already succeeded).
    const confirmSubject = sanitizeHeaderValue(`[Traverion] We received your support request (${ref})`);
    const confirmText = [
      `Hi${businessName ? ` ${businessName}` : ''},`,
      '',
      'Your support request has been sent to the Traverion team.',
      '',
      `Reference: ${ref}`,
      `Subject: ${subject}`,
      `Type: ${typeLabel}`,
      `Related to: ${areaLabel}`,
      '',
      'We will reply by email to this address.',
      '',
      '— Traverion',
    ].join('\n');
    const confirmHtml = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111;">
<p>Your support request has been sent to the Traverion team.</p>
<p><strong>Reference:</strong> ${escapeHtml(ref)}<br/>
<strong>Subject:</strong> ${escapeHtml(subject)}<br/>
<strong>Type:</strong> ${escapeHtml(typeLabel)}<br/>
<strong>Related to:</strong> ${escapeHtml(areaLabel)}</p>
<p>We will reply by email to this address.</p>
<p style="color:#6b7280;font-size:12px;">— Traverion</p>
</body></html>`;

    const confirmKey = `partner_support_confirm:${ref}`;
    const confirmClaim = await claimTransactionalSend(admin, {
      idempotencyKey: confirmKey,
      channel: 'supplier',
      templateKey: 'partner_support_confirm',
      entityType: 'partner_support_ref',
      entityId: ref,
    });
    if (confirmClaim.action === 'send') {
      const confirmSend = await sendResendEmail({
        apiKey,
        from: fromEmail,
        to: [replyTo],
        subject: confirmSubject,
        text: confirmText,
        html: confirmHtml,
      });
      await recordTransactionalSend(admin, {
        idempotencyKey: confirmKey,
        channel: 'supplier',
        templateKey: 'partner_support_confirm',
        recipientEmail: replyTo,
        entityType: 'partner_support_ref',
        entityId: ref,
        providerMessageId: confirmSend.ok ? confirmSend.id : null,
        status: confirmSend.ok ? 'sent' : 'failed',
        errorMessage: confirmSend.ok ? null : confirmSend.error,
      });
      if (!confirmSend.ok) {
        console.error('[submit-partner-support] confirm email failed', confirmSend.error);
      }
    }

    return json({
      success: true,
      reference: ref,
      providerMessageId: opsSend.id ?? null,
    });
  } catch (e) {
    console.error('[submit-partner-support]', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
