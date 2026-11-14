/**
 * Delivers committed transactional_email_log rows. Marks sent only after
 * the provider accepts the message. Failed rows stay failed and retryable
 * until the attempt cap.
 *
 * Auth: EMAIL_DELIVERY_CRON_SECRET only. The service-role key is not accepted.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { adminClientFromEnv, sendResendEmail } from '../_shared/transactional-email.ts';
import { deliveryResult, type QueuedEmailPayload } from '../_shared/transactional-email-queue.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization')?.trim() ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const expected = Deno.env.get('EMAIL_DELIVERY_CRON_SECRET')?.trim();
  if (!bearer || !expected || bearer.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= bearer.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function payloadOf(value: unknown): QueuedEmailPayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const to = Array.isArray(row.to) ? row.to.filter((item) => typeof item === 'string' && item.trim()) : [];
  if (!to.length) return null;
  if (typeof row.from !== 'string' || typeof row.subject !== 'string') return null;
  if (typeof row.text !== 'string' || typeof row.html !== 'string') return null;
  return {
    from: row.from,
    to: to as string[],
    subject: row.subject,
    text: row.text,
    html: row.html,
    replyTo: typeof row.replyTo === 'string' ? row.replyTo : null,
  };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false, error: 'POST only' }, 405);
  if (!authorized(req)) return json({ success: false, error: 'Unauthorized' }, 401);

  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!apiKey) return json({ success: false, error: 'RESEND_API_KEY not configured' }, 500);
  const admin = adminClientFromEnv();
  if (!admin) return json({ success: false, error: 'Supabase env missing' }, 500);

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(Math.floor(body.limit), 50))
      : 20;

  const claimed = await admin.rpc('claim_transactional_email_deliveries', { p_limit: limit });
  if (claimed.error) return json({ success: false, error: claimed.error.message }, 500);

  const rows = Array.isArray(claimed.data) ? claimed.data : [];
  const results: Array<{ id: string; status: string; providerMessageId: string | null; retryable: boolean }> = [];

  for (const row of rows) {
    const id = String(row.id ?? '');
    const attemptCount = Number(row.attempt_count ?? 0);
    const payload = payloadOf(row.payload);
    const nowMs = Date.now();
    if (!payload) {
      const failed = deliveryResult({
        attemptCount,
        providerOk: false,
        error: 'Queued payload is incomplete',
        nowMs,
      });
      await admin
        .from('transactional_email_log')
        .update({
          status: failed.status,
          provider_message_id: null,
          error_message: failed.errorMessage,
          next_attempt_at: failed.nextAttemptAt,
          locked_at: null,
          updated_at: new Date(nowMs).toISOString(),
        })
        .eq('id', id)
        .eq('status', 'sending');
      results.push({ id, status: failed.status, providerMessageId: null, retryable: failed.retryable });
      continue;
    }

    const sent = await sendResendEmail({
      apiKey,
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo ?? undefined,
    });
    const outcome = deliveryResult({
      attemptCount,
      providerOk: sent.ok,
      providerMessageId: sent.ok ? sent.id : null,
      error: sent.ok ? null : sent.error,
      nowMs: Date.now(),
    });
    const { error } = await admin
      .from('transactional_email_log')
      .update({
        status: outcome.status,
        provider_message_id: outcome.providerMessageId,
        error_message: outcome.errorMessage,
        next_attempt_at: outcome.nextAttemptAt,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'sending');
    if (error) {
      results.push({ id, status: 'failed', providerMessageId: null, retryable: true });
      continue;
    }
    results.push({
      id,
      status: outcome.status,
      providerMessageId: outcome.providerMessageId,
      retryable: outcome.retryable,
    });
  }

  return json({
    success: true,
    claimed: rows.length,
    sent: results.filter((row) => row.status === 'sent').length,
    failed: results.filter((row) => row.status === 'failed').length,
    results,
  });
});
