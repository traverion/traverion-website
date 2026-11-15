/**
 * P4: Execute queued Stripe Connect transfer reversals — TEST only.
 *
 * Kill switches (all required):
 * 1. Platform Stripe mode must be TEST (LIVE blocked)
 * 2. STRIPE_CONNECT_TRANSFERS_ENABLED must equal exactly "test"
 * 3. commercial_runtime_config.stripe_connect_transfers_enabled = 1
 *
 * Recovery is never marked settled here unless Stripe returns a reversal id
 * (confirm_connect_transfer_reversal). dry_run lists only.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { resolveStripeMoneySecretFromEnv } from '../_shared/resolve-stripe-money-secret.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function cronSecretAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization')?.trim() ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return false;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (serviceRole && bearer === serviceRole) return true;
  const candidates = [
    Deno.env.get('STRIPE_CONNECT_TRANSFERS_CRON_SECRET')?.trim(),
    Deno.env.get('EARNINGS_REFRESH_CRON_SECRET')?.trim(),
    Deno.env.get('CRON_SECRET')?.trim(),
    Deno.env.get('BOOKING_REMINDER_CRON_SECRET')?.trim(),
  ].filter((s): s is string => Boolean(s && s.length > 0));
  return candidates.some((s) => s === bearer);
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
  if (!cronSecretAuthorized(req)) return json({ success: false, error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const transfersFlag = (Deno.env.get('STRIPE_CONNECT_TRANSFERS_ENABLED') ?? '').trim().toLowerCase();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Supabase env missing' }, 500);
  }

  const stripeMoney = resolveStripeMoneySecretFromEnv(Deno.env);
  if (!stripeMoney.ok) {
    return json({ success: false, error: stripeMoney.error, live_blocked: true }, stripeMoney.status);
  }
  if (stripeMoney.mode !== 'test') {
    return json({
      success: false,
      error: 'Connect transfer reversals remain TEST-only. LIVE not enabled.',
      live_blocked: true,
      live_money: false,
    }, 503);
  }
  if (transfersFlag !== 'test') {
    return json({
      success: false,
      error: 'Set STRIPE_CONNECT_TRANSFERS_ENABLED=test to run TEST reversals only.',
      transfers_enabled: false,
      live_money: false,
    }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const stripe = new Stripe(stripeMoney.secret);
  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    dry_run?: boolean;
  };
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
  const dryRun = body.dry_run === true;

  const { data: cfgRow } = await admin
    .from('commercial_runtime_config')
    .select('value_int')
    .eq('key', 'stripe_connect_transfers_enabled')
    .maybeSingle();
  if (Number(cfgRow?.value_int ?? 0) !== 1) {
    return json({
      success: false,
      error: 'stripe_connect_transfers_enabled is 0 — reversals blocked',
      live_money: false,
    }, 503);
  }

  const { data: queued, error: listErr } = await admin.rpc('list_queued_connect_transfer_reversals', {
    p_limit: limit,
  });
  if (listErr) {
    return json({ success: false, error: listErr.message, stage: 'list_queued' }, 500);
  }

  const rows = Array.isArray(queued) ? queued : [];
  if (dryRun) {
    return json({
      success: true,
      dry_run: true,
      live_money: false,
      queued: rows.length,
      items: rows,
      note: 'Dry run — no Stripe createReversal',
    });
  }

  const results: Array<Record<string, unknown>> = [];
  let succeeded = 0;
  let failed = 0;
  let unavailable = 0;

  for (const row of rows) {
    const reversalId = row.id as string;
    const transferId = row.stripe_transfer_id as string;
    const amount = Number(row.amount_minor);
    const idempotencyKey = row.idempotency_key as string;

    await admin
      .from('supplier_transfer_reversal_attempts')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', reversalId)
      .eq('status', 'queued');

    try {
      const reversal = await stripe.transfers.createReversal(
        transferId,
        {
          amount,
          description: 'Traverion P4 TEST transfer reversal',
          metadata: {
            traverion_reversal_attempt_id: reversalId,
            traverion_booking_id: String(row.booking_id ?? ''),
          },
        },
        { idempotencyKey }
      );

      const { data: confirmed, error: confErr } = await admin.rpc('confirm_connect_transfer_reversal', {
        p_reversal_attempt_id: reversalId,
        p_stripe_reversal_id: reversal.id,
        p_amount_minor: amount,
        p_outcome: 'succeeded',
      });
      if (confErr) throw new Error(confErr.message);
      succeeded += 1;
      results.push({
        reversal_attempt_id: reversalId,
        stripe_reversal_id: reversal.id,
        amount_minor: amount,
        confirmed,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        typeof e === 'object' && e && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
      const isUnavailable =
        /insufficient|balance|cannot.*revers/i.test(msg) ||
        code === 'balance_insufficient' ||
        code === 'transfer_reversible_amount_insufficient';

      await admin.rpc('confirm_connect_transfer_reversal', {
        p_reversal_attempt_id: reversalId,
        p_stripe_reversal_id: null,
        p_amount_minor: amount,
        p_outcome: isUnavailable ? 'unavailable' : 'failed',
      });

      await admin
        .from('supplier_transfer_reversal_attempts')
        .update({
          status: isUnavailable ? 'unavailable' : 'failed',
          error_code: code || (isUnavailable ? 'unavailable' : 'reversal_failed'),
          error_message: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', reversalId);

      if (isUnavailable) unavailable += 1;
      else failed += 1;
      results.push({
        reversal_attempt_id: reversalId,
        error: msg,
        outcome: isUnavailable ? 'unavailable' : 'failed',
      });
    }
  }

  return json({
    success: true,
    live_money: false,
    environment: 'test',
    queued: rows.length,
    succeeded,
    failed,
    unavailable,
    results,
    note: 'Recovered only when Stripe reversal id confirmed via confirm_connect_transfer_reversal',
  });
});
