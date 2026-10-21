// deno-lint-ignore-file no-explicit-any
/**
 * Authenticated Partner Support Center submission.
 * Persists a request row, emails info@traverion.com (Reply-To = supplier),
 * and sends a short confirmation to the supplier.
 * Large attachments are stored in private communication-attachments bucket
 * (upload session) — emails include signed links, not Resend file payloads.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import {
  COMM_BUCKET,
  COMM_SIGNED_DOWNLOAD_SECONDS,
  hashClientToken,
} from '../_shared/communication-attachments.ts';
import {
  COMM_FROM_DEFAULT,
  COMM_INTERNAL_TO_DEFAULT,
  COMM_REPLY_INFO,
  communicationConfirmHtml,
  communicationConfirmText,
  communicationInternalHtml,
  communicationInternalText,
  type CommAttachmentEmailMeta,
} from '../_shared/communication-email.ts';
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

function sanitizeHeaderValue(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

function referenceCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `PS-${String(n).padStart(6, '0')}`;
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
      COMM_FROM_DEFAULT;
    const toEmail = (
      Deno.env.get('PARTNER_SUPPORT_TO') ??
      Deno.env.get('CONTACT_INQUIRY_TO') ??
      COMM_INTERNAL_TO_DEFAULT
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
    const uploadSessionId = String(body.uploadSessionId ?? body.upload_session_id ?? '').trim();
    const uploadClientToken = String(body.uploadClientToken ?? body.upload_client_token ?? '').trim();

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

    // Resolve attachments from upload session (preferred) — reject legacy base64 payloads.
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      const legacy = body.attachments as any[];
      if (legacy.some((a) => a && typeof a === 'object' && a.contentBase64)) {
        return json(
          {
            success: false,
            error: 'Please re-attach your files using the updated uploader, then send again.',
          },
          400
        );
      }
    }

    let attachmentRows: any[] = [];
    if (uploadSessionId) {
      if (!uploadClientToken) {
        return json({ success: false, error: 'Upload session token missing.' }, 400);
      }
      const tokenHash = await hashClientToken(uploadClientToken);
      const { data: session } = await admin
        .from('communication_upload_sessions')
        .select('*')
        .eq('id', uploadSessionId)
        .maybeSingle();
      if (!session || session.client_token_hash !== tokenHash) {
        return json({ success: false, error: 'Invalid upload session.' }, 403);
      }
      if (session.category !== 'partner_support') {
        return json({ success: false, error: 'Upload session category mismatch.' }, 400);
      }
      if (session.submitter_user_id && session.submitter_user_id !== user.id) {
        return json({ success: false, error: 'Upload session belongs to another user.' }, 403);
      }
      if (session.status !== 'open') {
        return json({ success: false, error: 'Upload session is no longer open.' }, 409);
      }
      const { data: atts } = await admin
        .from('communication_attachments')
        .select('*')
        .eq('session_id', uploadSessionId)
        .eq('status', 'uploaded');
      attachmentRows = atts ?? [];
    }

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
    let requestId: string | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: inserted, error: insertErr } = await admin
        .from('partner_support_requests')
        .insert({
          reference_code: ref,
          supplier_id: supplierId,
          submitter_user_id: user.id,
          request_type: requestType,
          related_area: relatedArea,
          subject,
          message,
          page_url: pageUrl || null,
          attachment_names: attachmentRows.map((a) => a.original_filename),
          attachment_meta: attachmentRows.map((a) => ({
            id: a.id,
            filename: a.original_filename,
            contentType: a.content_type,
            byteSize: a.byte_size,
            kind: a.kind,
          })),
          upload_session_id: uploadSessionId || null,
          internal_email_status: 'queued',
          confirm_email_status: 'queued',
          last_email_attempt_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (!insertErr && inserted?.id) {
        requestId = inserted.id;
        break;
      }
      if (insertErr?.code === '23505') {
        ref = referenceCode();
        continue;
      }
      console.error('[submit-partner-support] insert failed', insertErr?.message);
      return json({ success: false, error: 'Could not save your request. Try again.' }, 500);
    }
    if (!requestId) {
      return json({ success: false, error: 'Could not save your request. Try again.' }, 500);
    }

    if (uploadSessionId) {
      await admin
        .from('communication_upload_sessions')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          submission_kind: 'partner_support',
          submission_id: requestId,
        })
        .eq('id', uploadSessionId);
      if (attachmentRows.length) {
        await admin
          .from('communication_attachments')
          .update({
            status: 'linked',
            submission_kind: 'partner_support',
            submission_id: requestId,
          })
          .eq('session_id', uploadSessionId)
          .eq('status', 'uploaded');
      }
    }

    const emailAttachments: CommAttachmentEmailMeta[] = [];
    for (const a of attachmentRows) {
      const { data: signed } = await admin.storage
        .from(COMM_BUCKET)
        .createSignedUrl(a.storage_path, COMM_SIGNED_DOWNLOAD_SECONDS);
      emailAttachments.push({
        filename: a.original_filename,
        contentType: a.content_type,
        byteSize: Number(a.byte_size),
        accessUrl: signed?.signedUrl ?? null,
      });
    }

    const submittedAt = new Date().toISOString();
    const typeLabel = TYPE_LABEL[requestType] ?? requestType;
    const areaLabel = AREA_LABEL[relatedArea] ?? relatedArea;
    const tag = TYPE_TAG[requestType] ?? 'Support';
    const opsSubject = sanitizeHeaderValue(`[Traverion Support] [${tag}] ${subject}`).slice(0, 200);

    const rows = [
      { label: 'Business', value: businessName },
      { label: 'Email', value: replyTo },
      { label: 'Supplier ID', value: supplierId },
      { label: 'Submitter user ID', value: user.id },
      { label: 'Request type', value: typeLabel },
      { label: 'Related to', value: areaLabel },
      { label: 'Subject', value: subject },
      { label: 'Page URL', value: pageUrl },
    ];

    const opsSend = await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: [toEmail],
      replyTo,
      subject: opsSubject,
      text: communicationInternalText({
        categoryLabel: 'Partner Support',
        reference: ref,
        submittedAt,
        rows,
        message,
        attachments: emailAttachments,
      }),
      html: communicationInternalHtml({
        categoryLabel: 'Partner Support',
        reference: ref,
        submittedAt,
        rows,
        message,
        attachments: emailAttachments,
      }),
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
      await admin
        .from('partner_support_requests')
        .update({
          internal_email_status: 'failed',
          last_email_attempt_at: new Date().toISOString(),
        })
        .eq('id', requestId);
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

    await admin
      .from('partner_support_requests')
      .update({
        internal_email_status: 'accepted',
        internal_provider_message_id: opsSend.id ?? null,
        last_email_attempt_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    const confirmSubject = sanitizeHeaderValue(
      `[Traverion] We received your support request (${ref})`
    );
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
        replyTo: COMM_REPLY_INFO,
        subject: confirmSubject,
        text: communicationConfirmText({
          greetingName: businessName,
          intro: 'Your support request has been sent to the Traverion team.',
          reference: ref,
          detailsLines: [
            `Subject: ${subject}`,
            `Type: ${typeLabel}`,
            `Related to: ${areaLabel}`,
          ],
        }),
        html: communicationConfirmHtml({
          headline: 'Support request received',
          greetingName: businessName,
          intro: 'Your support request has been sent to the Traverion team.',
          reference: ref,
          detailsHtml: `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1f26;"><strong>Subject:</strong> ${subject.replace(/</g, '')}<br/><strong>Type:</strong> ${typeLabel}<br/><strong>Related to:</strong> ${areaLabel}</p>`,
        }),
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
      await admin
        .from('partner_support_requests')
        .update({
          confirm_email_status: confirmSend.ok ? 'accepted' : 'failed',
          confirm_provider_message_id: confirmSend.ok ? confirmSend.id : null,
          last_email_attempt_at: new Date().toISOString(),
        })
        .eq('id', requestId);
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
