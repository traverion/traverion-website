/**
 * Shared Resend send + idempotency for Traverion Edge Functions.
 * Business state must already be committed before calling these helpers.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  enqueueDecision,
  type QueuedEmailPayload,
} from './transactional-email-queue.ts';

export type EmailChannel = 'customer' | 'supplier' | 'staff';

export type ClaimResult =
  | { action: 'send' }
  | { action: 'skip'; reason: 'already_sent' | 'cooldown' };

export function adminClientFromEnv(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Returns whether this idempotency key may send.
 * - Unique insert of a "pending" row is not used; we check existing sent rows,
 *   then send, then insert sent/failed. Concurrent double-send is still blocked
 *   by unique(idempotency_key) on the success insert.
 */
export async function claimTransactionalSend(
  admin: SupabaseClient,
  params: {
    idempotencyKey: string;
    channel: EmailChannel;
    templateKey: string;
    entityType?: string;
    entityId?: string;
    /** Skip if same template+entity sent within this many seconds (message spam). */
    cooldownSeconds?: number;
  }
): Promise<ClaimResult> {
  const { data: existing } = await admin
    .from('transactional_email_log')
    .select('id, status, created_at')
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle();

  if (existing && (existing.status === 'sent' || existing.status === 'skipped')) {
    return { action: 'skip', reason: 'already_sent' };
  }

  if (params.cooldownSeconds && params.entityType && params.entityId) {
    const since = new Date(Date.now() - params.cooldownSeconds * 1000).toISOString();
    const { data: recent } = await admin
      .from('transactional_email_log')
      .select('id')
      .eq('channel', params.channel)
      .eq('template_key', params.templateKey)
      .eq('entity_type', params.entityType)
      .eq('entity_id', params.entityId)
      .eq('status', 'sent')
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();
    if (recent) return { action: 'skip', reason: 'cooldown' };
  }

  return { action: 'send' };
}

export async function recordTransactionalSend(
  admin: SupabaseClient,
  params: {
    idempotencyKey: string;
    channel: EmailChannel;
    templateKey: string;
    recipientEmail?: string | null;
    entityType?: string;
    entityId?: string;
    providerMessageId?: string | null;
    status: 'sent' | 'skipped' | 'failed';
    errorMessage?: string | null;
  }
): Promise<void> {
  const { error } = await admin.from('transactional_email_log').upsert(
    {
      idempotency_key: params.idempotencyKey,
      channel: params.channel,
      template_key: params.templateKey,
      recipient_email: params.recipientEmail ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      provider_message_id: params.providerMessageId ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
    },
    { onConflict: 'idempotency_key' }
  );
  if (error) {
    console.error('[transactional_email_log] write failed', error.message, params.idempotencyKey);
  }
}

export async function enqueueTransactionalEmail(
  admin: SupabaseClient,
  params: {
    idempotencyKey: string;
    channel: EmailChannel;
    templateKey: string;
    recipientEmail?: string | null;
    entityType?: string;
    entityId?: string;
    payload: QueuedEmailPayload;
  },
): Promise<{ ok: true; queued: true; alreadySent: boolean } | { ok: false; error: string }> {
  const { data: existing, error: readError } = await admin
    .from('transactional_email_log')
    .select('id, status')
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };

  const decision = enqueueDecision(existing?.status ?? null);
  if (decision === 'already_sent') return { ok: true, queued: true, alreadySent: true };
  if (decision === 'already_queued') return { ok: true, queued: true, alreadySent: false };

  const row = {
    idempotency_key: params.idempotencyKey,
    channel: params.channel,
    template_key: params.templateKey,
    recipient_email: params.recipientEmail ?? null,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    payload: params.payload,
    status: 'queued',
    error_message: null,
    provider_message_id: null,
    locked_at: null,
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (decision === 'requeue' && existing?.id) {
    const { error } = await admin
      .from('transactional_email_log')
      .update(row)
      .eq('id', existing.id)
      .eq('status', 'failed');
    if (error) return { ok: false, error: error.message };
    return { ok: true, queued: true, alreadySent: false };
  }

  const { error } = await admin.from('transactional_email_log').insert(row);
  if (!error) return { ok: true, queued: true, alreadySent: false };
  if (!/duplicate|unique/i.test(error.message)) return { ok: false, error: error.message };

  const { data: raced, error: raceError } = await admin
    .from('transactional_email_log')
    .select('status')
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle();
  if (raceError || !raced) return { ok: false, error: raceError?.message ?? 'Queue insert was not committed' };
  if (raced.status === 'sent' || raced.status === 'skipped') {
    return { ok: true, queued: true, alreadySent: true };
  }
  return { ok: true, queued: true, alreadySent: false };
}

/** Ask the worker to drain the outbox without making the caller wait for Resend. */
export function kickTransactionalDelivery(): void {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = Deno.env.get('EMAIL_DELIVERY_CRON_SECRET')?.trim();
  if (!url || !key) return;
  const run = fetch(`${url}/functions/v1/deliver-transactional-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 20 }),
  }).then(() => undefined, () => undefined);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(run);
}

export async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string; status: number }> {
  const body: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  };
  if (params.replyTo) body.reply_to = params.replyTo;
  if (params.attachments?.length) body.attachments = params.attachments;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    return { ok: false, error: json.message ?? `Resend HTTP ${res.status}`, status: res.status };
  }
  return { ok: true, id: json.id ?? null };
}
