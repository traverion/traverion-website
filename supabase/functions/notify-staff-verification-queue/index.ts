/**
 * Called by Supabase Database Webhook on supplier_profiles UPDATE.
 * Emails your ops inbox when a supplier enters the business or payout verification queue.
 *
 * Secrets: RESEND_API_KEY, SUPPLIER_EMAIL_FROM (reuse notify-supplier-event),
 *          STAFF_VERIFICATION_EMAIL (e.g. info@traverion.com),
 *          VERIFICATION_WEBHOOK_SECRET (same value you put in the webhook Authorization header).
 *
 * Disable JWT verification for this function (like admin-supplier-verification).
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function submittedChanged(
  oldRow: Record<string, unknown> | null | undefined,
  newRow: Record<string, unknown> | null | undefined,
  key: string
): boolean {
  const before = str(oldRow?.[key]);
  const after = str(newRow?.[key]);
  if (!after) return false;
  return before !== after;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const expected = Deno.env.get('VERIFICATION_WEBHOOK_SECRET')?.trim();
  if (!expected) {
    return json({ error: 'VERIFICATION_WEBHOOK_SECRET not set on function' }, 500);
  }

  const auth = req.headers.get('authorization')?.trim();
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const staffEmail = Deno.env.get('STAFF_VERIFICATION_EMAIL')?.trim();
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('SUPPLIER_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';

  if (!staffEmail || !apiKey) {
    return json({ error: 'STAFF_VERIFICATION_EMAIL or RESEND_API_KEY missing' }, 500);
  }

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (body.type !== 'UPDATE' || body.table !== 'supplier_profiles') {
    return json({ ok: true, skipped: true, reason: 'not_target' });
  }

  const rec = body.record ?? {};
  const old = body.old_record ?? {};

  const biz = submittedChanged(old, rec, 'verification_submitted_at');
  const pay = submittedChanged(old, rec, 'payout_verification_submitted_at');

  if (!biz && !pay) {
    return json({ ok: true, skipped: true, reason: 'no_submission_timestamp_change' });
  }

  const id = str(rec.id);
  const name = str(rec.company_legal_name) || str(rec.display_name) || id;
  const lines: string[] = [
    'A supplier submitted or updated something in the verification queue.',
    '',
    `Supplier id: ${id}`,
    `Name: ${name}`,
  ];
  if (biz) {
    lines.push(`Business: verification_submitted_at is set (status: ${str(rec.verification_status) || '—'}).`);
  }
  if (pay) {
    lines.push(`Payout: payout_verification_submitted_at is set (status: ${str(rec.payout_verification_status) || '—'}).`);
  }
  lines.push('');
  lines.push('Open Traverion Admin → Supplier verification to approve or reject.');

  const subject =
    biz && pay
      ? `[Traverion] Verification queue: ${name} (business + payout)`
      : biz
        ? `[Traverion] Verification queue: ${name} (business)`
        : `[Traverion] Verification queue: ${name} (payout)`;

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [staffEmail],
      subject,
      text: lines.join('\n'),
    }),
  });

  const resendJson: any = await resendResp.json().catch(() => ({}));
  if (!resendResp.ok) {
    return json({ error: resendJson?.message ?? 'Resend failed' }, 500);
  }

  return json({ ok: true, emailed: staffEmail, resendId: resendJson?.id ?? null });
});
