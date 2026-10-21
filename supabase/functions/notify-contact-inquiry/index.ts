// deno-lint-ignore-file no-explicit-any
/**
 * Ops + confirmation emails for contact / affiliate / content-creator / supplier inquiries.
 * Loads contact_inquiries by id (DB truth only). Idempotent per inquiryId.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
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
  escapeHtml,
  type CommAttachmentEmailMeta,
} from '../_shared/communication-email.ts';
import {
  adminClientFromEnv,
  claimTransactionalSend,
  recordTransactionalSend,
  sendResendEmail,
} from '../_shared/transactional-email.ts';

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

function categoryMeta(inquiryType: string): {
  label: string;
  subjectTag: string;
  confirmHeadline: string;
  confirmIntro: string;
} {
  switch (inquiryType) {
    case 'affiliate':
      return {
        label: 'Affiliate Application',
        subjectTag: 'Affiliate Application',
        confirmHeadline: 'Affiliate application received',
        confirmIntro:
          'Thank you for your interest in Traverion. We have received your affiliate application and will review it. This message confirms receipt only — it is not an approval.',
      };
    case 'content_creator':
      return {
        label: 'Creator Application',
        subjectTag: 'Creator Application',
        confirmHeadline: 'Creator application received',
        confirmIntro:
          'Thank you for your interest in collaborating with Traverion. We have received your application and will review it. This message confirms receipt only — it is not a collaboration acceptance.',
      };
    case 'supplier':
      return {
        label: 'Supplier Application',
        subjectTag: 'Supplier Application',
        confirmHeadline: 'Supplier application received',
        confirmIntro:
          'Thank you for your interest in listing with Traverion. We have received your application and will review it. This message confirms receipt only — it is not account verification or approval.',
      };
    case 'booking':
      return {
        label: 'Contact — Booking help',
        subjectTag: 'Booking',
        confirmHeadline: "We've received your message",
        confirmIntro: 'Thank you for contacting Traverion. We have received your message.',
      };
    case 'trip':
      return {
        label: 'Contact — My trip',
        subjectTag: 'My trip',
        confirmHeadline: "We've received your message",
        confirmIntro: 'Thank you for contacting Traverion. We have received your message.',
      };
    case 'payment':
      return {
        label: 'Contact — Payment',
        subjectTag: 'Payment',
        confirmHeadline: "We've received your message",
        confirmIntro: 'Thank you for contacting Traverion. We have received your message.',
      };
    case 'partner':
      return {
        label: 'Contact — Partner / supplier',
        subjectTag: 'Partner',
        confirmHeadline: "We've received your message",
        confirmIntro: 'Thank you for contacting Traverion. We have received your message.',
      };
    default:
      return {
        label: 'Contact',
        subjectTag: 'Contact',
        confirmHeadline: "We've received your message",
        confirmIntro: 'Thank you for contacting Traverion. We have received your message.',
      };
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
    const fromEmail =
      Deno.env.get('CONTACT_EMAIL_FROM') ??
      Deno.env.get('SUPPLIER_EMAIL_FROM') ??
      COMM_FROM_DEFAULT;
    const toEmail = (Deno.env.get('CONTACT_INQUIRY_TO') ?? COMM_INTERNAL_TO_DEFAULT).trim();
    if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);

    const admin = adminClientFromEnv();
    if (!admin) {
      return json({ success: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const inquiryId = String(body.inquiryId ?? body.inquiry_id ?? '').trim();
    const uploadClientToken = String(body.uploadClientToken ?? body.upload_client_token ?? '').trim();
    if (!inquiryId) {
      return json({ success: false, error: 'inquiryId required' }, 400);
    }

    const { data: row, error: rowErr } = await admin
      .from('contact_inquiries')
      .select(
        'id, name, email, phone, subject, message, inquiry_type, reference_code, booking_reference, structured_data, upload_session_id, internal_email_status, confirm_email_status, created_at'
      )
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
    const bookingRef = String(row.booking_reference ?? '').trim();
    const structured = (row.structured_data ?? {}) as Record<string, unknown>;
    let reference = String(row.reference_code ?? '').trim();
    if (!name || !email || !subject || !message) {
      return json({ success: false, error: 'Inquiry row incomplete' }, 400);
    }

    if (!reference) {
      const prefix =
        inquiryType === 'affiliate'
          ? 'AF'
          : inquiryType === 'content_creator'
            ? 'CR'
            : inquiryType === 'supplier'
              ? 'SP'
              : 'CT';
      for (let i = 0; i < 5; i++) {
        const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
        const candidate = `${prefix}-${String(n).padStart(6, '0')}`;
        const { error } = await admin
          .from('contact_inquiries')
          .update({ reference_code: candidate })
          .eq('id', inquiryId)
          .is('reference_code', null);
        if (!error) {
          reference = candidate;
          break;
        }
      }
      if (!reference) reference = `${prefix}-000000`;
    }

    // Link upload session attachments when provided
    let attachmentRows: any[] = [];
    const sessionId = String(row.upload_session_id ?? '').trim();
    if (sessionId) {
      if (uploadClientToken) {
        const tokenHash = await hashClientToken(uploadClientToken);
        const { data: session } = await admin
          .from('communication_upload_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();
        if (session && session.client_token_hash === tokenHash && session.status === 'open') {
          await admin
            .from('communication_upload_sessions')
            .update({
              status: 'finalized',
              finalized_at: new Date().toISOString(),
              submission_kind: 'contact_inquiry',
              submission_id: inquiryId,
            })
            .eq('id', sessionId);
          await admin
            .from('communication_attachments')
            .update({
              status: 'linked',
              submission_kind: 'contact_inquiry',
              submission_id: inquiryId,
            })
            .eq('session_id', sessionId)
            .eq('status', 'uploaded');
        }
      }
      const { data: atts } = await admin
        .from('communication_attachments')
        .select('*')
        .or(
          `and(session_id.eq.${sessionId},status.in.(uploaded,linked)),and(submission_kind.eq.contact_inquiry,submission_id.eq.${inquiryId})`
        );
      // Prefer linked/uploaded for this session
      const { data: atts2 } = await admin
        .from('communication_attachments')
        .select('*')
        .eq('session_id', sessionId)
        .in('status', ['uploaded', 'linked']);
      attachmentRows = atts2 ?? atts ?? [];
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

    const meta = categoryMeta(inquiryType);
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
      return json({
        success: true,
        skipped: true,
        reason: claim.reason,
        reference,
      });
    }

    const structuredRows = Object.entries(structured)
      .filter(([, v]) => v != null && String(v).trim())
      .map(([k, v]) => ({
        label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value: String(v),
      }));

    const rows = [
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      { label: 'Phone', value: phone },
      { label: 'Booking reference', value: bookingRef },
      { label: 'Category', value: meta.label },
      { label: 'Subject', value: subject },
      ...structuredRows,
    ];

    const applicantName =
      inquiryType === 'affiliate' || inquiryType === 'content_creator' || inquiryType === 'supplier'
        ? name
        : '';
    const opsSubject = sanitizeHeaderValue(
      inquiryType === 'affiliate'
        ? `[Traverion Affiliate Application] [${name}] — ${reference}`
        : inquiryType === 'content_creator'
          ? `[Traverion Creator Application] [${name}] — ${reference}`
          : inquiryType === 'supplier'
            ? `[Traverion Supplier Application] [${String(structured.business_name ?? name)}] — ${reference}`
            : `[Traverion Contact] [${meta.subjectTag}] ${subject} — ${reference}`
    ).slice(0, 200);

    const submittedAt = String(row.created_at ?? new Date().toISOString());

    await admin
      .from('contact_inquiries')
      .update({
        internal_email_status: 'queued',
        last_email_attempt_at: new Date().toISOString(),
      })
      .eq('id', inquiryId);

    const opsSend = await sendResendEmail({
      apiKey,
      from: fromEmail,
      to: [toEmail],
      replyTo: email,
      subject: opsSubject,
      text: communicationInternalText({
        categoryLabel: meta.label,
        reference,
        submittedAt,
        rows,
        message,
        attachments: emailAttachments,
      }),
      html: communicationInternalHtml({
        categoryLabel: meta.label,
        reference,
        submittedAt,
        rows,
        message,
        attachments: emailAttachments,
      }),
    });

    if (!opsSend.ok) {
      await recordTransactionalSend(admin, {
        idempotencyKey,
        channel: 'staff',
        templateKey: 'contact_inquiry',
        recipientEmail: toEmail,
        entityType: 'contact_email',
        entityId: emailKey,
        status: 'failed',
        errorMessage: opsSend.error ?? 'Resend error',
      });
      await admin
        .from('contact_inquiries')
        .update({
          internal_email_status: 'failed',
          last_email_attempt_at: new Date().toISOString(),
        })
        .eq('id', inquiryId);
      return json({ success: false, error: opsSend.error ?? 'Email failed' }, 500);
    }

    await recordTransactionalSend(admin, {
      idempotencyKey,
      channel: 'staff',
      templateKey: 'contact_inquiry',
      recipientEmail: toEmail,
      entityType: 'contact_email',
      entityId: emailKey,
      providerMessageId: opsSend.id ?? null,
      status: 'sent',
    });

    await admin
      .from('contact_inquiries')
      .update({
        internal_email_status: 'accepted',
        internal_provider_message_id: opsSend.id ?? null,
        last_email_attempt_at: new Date().toISOString(),
      })
      .eq('id', inquiryId);

    // Confirmation to submitter
    const confirmKey = `contact_inquiry_confirm:${inquiryId}`;
    const confirmClaim = await claimTransactionalSend(admin, {
      idempotencyKey: confirmKey,
      channel: 'customer',
      templateKey: 'contact_inquiry_confirm',
      entityType: 'contact_inquiry',
      entityId: inquiryId,
    });

    let confirmOk = false;
    let confirmId: string | null = null;
    if (confirmClaim.action === 'send') {
      const confirmSubject = sanitizeHeaderValue(
        inquiryType === 'affiliate'
          ? `[Traverion] Affiliate application received (${reference})`
          : inquiryType === 'content_creator'
            ? `[Traverion] Creator application received (${reference})`
            : inquiryType === 'supplier'
              ? `[Traverion] Supplier application received (${reference})`
              : `[Traverion] We've received your message (${reference})`
      );
      const confirmSend = await sendResendEmail({
        apiKey,
        from: fromEmail,
        to: [email],
        replyTo: COMM_REPLY_INFO,
        subject: confirmSubject,
        text: communicationConfirmText({
          greetingName: name,
          intro: meta.confirmIntro,
          reference,
          detailsLines: [
            `Regarding: "${subject}"`,
            applicantName && inquiryType === 'supplier'
              ? `Business: ${String(structured.business_name ?? '')}`
              : '',
          ].filter(Boolean),
        }),
        html: communicationConfirmHtml({
          headline: meta.confirmHeadline,
          greetingName: name,
          intro: meta.confirmIntro,
          reference,
          detailsHtml: `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1f26;">Regarding: &ldquo;${escapeHtml(subject)}&rdquo;</p>`,
        }),
      });
      confirmOk = confirmSend.ok;
      confirmId = confirmSend.ok ? confirmSend.id : null;
      await recordTransactionalSend(admin, {
        idempotencyKey: confirmKey,
        channel: 'customer',
        templateKey: 'contact_inquiry_confirm',
        recipientEmail: email,
        entityType: 'contact_inquiry',
        entityId: inquiryId,
        providerMessageId: confirmId,
        status: confirmSend.ok ? 'sent' : 'failed',
        errorMessage: confirmSend.ok ? null : confirmSend.error,
      });
      await admin
        .from('contact_inquiries')
        .update({
          confirm_email_status: confirmSend.ok ? 'accepted' : 'failed',
          confirm_provider_message_id: confirmId,
          last_email_attempt_at: new Date().toISOString(),
        })
        .eq('id', inquiryId);
      if (!confirmSend.ok) {
        console.error('[notify-contact-inquiry] confirm failed', confirmSend.error);
      }
    } else {
      confirmOk = true; // already sent
      await admin
        .from('contact_inquiries')
        .update({ confirm_email_status: 'skipped' })
        .eq('id', inquiryId);
    }

    return json({
      success: true,
      reference,
      providerMessageId: opsSend.id ?? null,
      confirmSent: confirmOk,
    });
  } catch (e) {
    console.error('[notify-contact-inquiry]', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
