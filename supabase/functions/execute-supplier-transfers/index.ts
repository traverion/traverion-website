/**
 * Mission 2 Phases 3–5: Stripe Connect SCAT transfers + optional bank payout create (TEST only).
 *
 * Kill switches (all required for any money movement):
 * 1. STRIPE_SECRET_KEY must be sk_test_
 * 2. STRIPE_CONNECT_TRANSFERS_ENABLED must equal exactly "test"
 * 3. commercial_runtime_config.stripe_connect_transfers_enabled = 1
 * 4. supplier_transfer_batches constrained to environment=test, live_money_enabled=false
 *
 * Live money is never activated by this function.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';

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
  const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
  const transfersFlag = (Deno.env.get('STRIPE_CONNECT_TRANSFERS_ENABLED') ?? '').trim().toLowerCase();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Supabase env missing' }, 500);
  }
  if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);
  if (!isStripeTestSecretKey(stripeSecret)) {
    return json({ success: false, error: stripeLiveSecretBlockedMessage(), live_blocked: true }, 503);
  }
  if (transfersFlag !== 'test') {
    return json({
      success: false,
      error: 'Stripe Connect transfers disabled. Set STRIPE_CONNECT_TRANSFERS_ENABLED=test to run TEST transfers only.',
      transfers_enabled: false,
      live_money: false,
    }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const stripe = new Stripe(stripeSecret);
  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    create_bank_payouts?: boolean;
    dry_run?: boolean;
    now?: string;
  };
  const nowIso =
    typeof body.now === 'string' && body.now.trim() ? body.now.trim() : new Date().toISOString();
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
  const createBankPayouts = body.create_bank_payouts === true;
  const dryRun = body.dry_run === true;

  const { data: cfgRow } = await admin
    .from('commercial_runtime_config')
    .select('value_int')
    .eq('key', 'stripe_connect_transfers_enabled')
    .maybeSingle();
  if (!cfgRow || Number(cfgRow.value_int) !== 1) {
    return json({
      success: false,
      error: 'DB kill switch stripe_connect_transfers_enabled is not 1',
      transfers_enabled: false,
    }, 503);
  }

  // Snapshot platform balance → liquidity helper (never use raw available alone).
  const balance = await stripe.balance.retrieve();
  const eurAvailable =
    balance.available.find((b) => b.currency === 'eur')?.amount ??
    balance.available[0]?.amount ??
    0;
  const eurPending =
    balance.pending.find((b) => b.currency === 'eur')?.amount ??
    balance.pending[0]?.amount ??
    0;

  const { data: liquidity, error: liqErr } = await admin.rpc('compute_platform_transferable_minor', {
    p_currency: 'EUR',
    p_stripe_available_minor: eurAvailable,
  });
  if (liqErr) {
    return json({ success: false, error: liqErr.message, stage: 'liquidity' }, 500);
  }

  await admin.from('platform_liquidity_snapshots').insert({
    currency: 'EUR',
    stripe_available_minor: eurAvailable,
    stripe_pending_minor: eurPending,
    reserved_for_refunds_minor: Number((liquidity as { reserved_for_refunds_minor?: number })?.reserved_for_refunds_minor ?? 0),
    reserved_operating_minor: Number((liquidity as { reserved_operating_minor?: number })?.reserved_operating_minor ?? 0),
    transferable_minor: Number((liquidity as { transferable_minor?: number })?.transferable_minor ?? 0),
    outstanding_supplier_liability_minor: Number(
      (liquidity as { outstanding_supplier_liability_minor?: number })?.outstanding_supplier_liability_minor ?? 0
    ),
    note: 'execute-supplier-transfers TEST batch',
  });

  const transferable = Number((liquidity as { transferable_minor?: number })?.transferable_minor ?? 0);

  const { data: batch, error: batchErr } = await admin
    .from('supplier_transfer_batches')
    .insert({
      scheduled_for: nowIso.slice(0, 10),
      status: 'running',
      environment: 'test',
      live_money_enabled: false,
      note: dryRun ? 'dry_run' : 'test_transfers',
    })
    .select('id')
    .single();
  if (batchErr || !batch?.id) {
    return json({ success: false, error: batchErr?.message ?? 'batch_insert_failed' }, 500);
  }

  const { data: dueRows, error: dueErr } = await admin.rpc('list_due_connect_transfer_periods', {
    p_now: nowIso,
    p_limit: limit,
  });
  if (dueErr) {
    await admin
      .from('supplier_transfer_batches')
      .update({ status: 'failed', finished_at: new Date().toISOString(), note: dueErr.message })
      .eq('id', batch.id);
    return json({ success: false, error: dueErr.message, stage: 'list_due' }, 500);
  }

  const results: Array<Record<string, unknown>> = [];
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let remainingLiquidity = transferable;

  for (const row of (dueRows ?? []) as Array<{
    payout_period_id: string;
    supplier_id: string;
    currency: string;
    amount_minor: number;
    stripe_connected_account_id: string;
  }>) {
    attempted += 1;
    const amount = Number(row.amount_minor) || 0;

    if (amount > remainingLiquidity) {
      failed += 1;
      await admin.from('supplier_payout_exceptions').insert({
        supplier_id: row.supplier_id,
        payout_period_id: row.payout_period_id,
        reason_code: 'insufficient_platform_liquidity',
        detail: `Need ${amount}, transferable remaining ${remainingLiquidity}`,
      });
      results.push({
        payout_period_id: row.payout_period_id,
        status: 'skipped',
        reason: 'insufficient_platform_liquidity',
      });
      continue;
    }

    if (dryRun) {
      results.push({
        payout_period_id: row.payout_period_id,
        status: 'dry_run_ok',
        amount_minor: amount,
      });
      continue;
    }

    const { data: reserved, error: resErr } = await admin.rpc('reserve_supplier_transfer_attempt', {
      p_batch_id: batch.id,
      p_payout_period_id: row.payout_period_id,
      p_attempt_number: 1,
    });
    if (resErr || !(reserved as { ok?: boolean })?.ok) {
      failed += 1;
      const reason =
        (reserved as { error?: string })?.error ??
        resErr?.message ??
        'reserve_failed';
      if (reason !== 'duplicate_active_transfer' && reason !== 'preflight_failed') {
        await admin.from('supplier_payout_exceptions').insert({
          supplier_id: row.supplier_id,
          payout_period_id: row.payout_period_id,
          reason_code: reason,
          detail: JSON.stringify(reserved ?? {}),
        });
      }
      results.push({ payout_period_id: row.payout_period_id, status: 'skipped', reason, reserved });
      continue;
    }

    const attemptId = (reserved as { transfer_attempt_id: string }).transfer_attempt_id;
    const idempotency = (reserved as { idempotency_key: string }).idempotency_key;
    const destination = (reserved as { destination: string }).destination;

    await admin
      .from('supplier_transfer_attempts')
      .update({ status: 'transfer_pending', updated_at: new Date().toISOString() })
      .eq('id', attemptId);

    try {
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: (row.currency || 'eur').toLowerCase(),
          destination,
          transfer_group: `period_${row.payout_period_id}`,
          metadata: {
            traverion_payout_period_id: row.payout_period_id,
            traverion_transfer_attempt_id: attemptId,
            traverion_supplier_id: row.supplier_id,
            traverion_environment: 'test',
          },
        },
        { idempotencyKey: idempotency }
      );

      await admin
        .from('supplier_transfer_attempts')
        .update({
          status: 'transfer_completed',
          stripe_transfer_id: transfer.id,
          stripe_balance_transaction_id:
            typeof transfer.balance_transaction === 'string'
              ? transfer.balance_transaction
              : transfer.balance_transaction?.id ?? null,
          transferred_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', attemptId);

      await admin
        .from('supplier_payout_periods')
        .update({
          connect_lifecycle: 'transfer_completed',
          latest_transfer_attempt_id: attemptId,
        })
        .eq('id', row.payout_period_id);

      remainingLiquidity -= amount;
      succeeded += 1;

      let bankPayoutId: string | null = null;
      if (createBankPayouts) {
        // Prefer automatic connected-account schedule; optional explicit TEST payout create.
        const bankIdempotency = `payout:${row.payout_period_id}:1`;
        const { data: bankRow, error: bankInsErr } = await admin
          .from('supplier_bank_payout_attempts')
          .insert({
            transfer_attempt_id: attemptId,
            payout_period_id: row.payout_period_id,
            supplier_id: row.supplier_id,
            currency: (row.currency || 'EUR').toUpperCase(),
            amount_minor: amount,
            status: 'pending',
            idempotency_key: bankIdempotency,
          })
          .select('id')
          .single();
        if (!bankInsErr && bankRow?.id) {
          try {
            const payout = await stripe.payouts.create(
              {
                amount,
                currency: (row.currency || 'eur').toLowerCase(),
                metadata: {
                  traverion_bank_payout_attempt_id: bankRow.id,
                  traverion_payout_period_id: row.payout_period_id,
                  traverion_environment: 'test',
                },
              },
              {
                stripeAccount: destination,
                idempotencyKey: bankIdempotency,
              }
            );
            bankPayoutId = payout.id;
            await admin
              .from('supplier_bank_payout_attempts')
              .update({
                stripe_payout_id: payout.id,
                status: payout.status === 'paid' ? 'paid' : payout.status === 'in_transit' ? 'in_transit' : 'pending',
                arrival_date: payout.arrival_date
                  ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
                  : null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', bankRow.id);
            await admin
              .from('supplier_payout_periods')
              .update({
                connect_lifecycle:
                  payout.status === 'paid' ? 'bank_payout_paid' : 'bank_payout_pending',
                latest_bank_payout_attempt_id: bankRow.id,
              })
              .eq('id', row.payout_period_id);
          } catch (bankErr) {
            await admin
              .from('supplier_bank_payout_attempts')
              .update({
                status: 'failed',
                failure_message: bankErr instanceof Error ? bankErr.message : 'bank_payout_failed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', bankRow.id);
            await admin
              .from('supplier_payout_periods')
              .update({ connect_lifecycle: 'bank_payout_failed' })
              .eq('id', row.payout_period_id);
            await admin.from('supplier_payout_exceptions').insert({
              supplier_id: row.supplier_id,
              payout_period_id: row.payout_period_id,
              transfer_attempt_id: attemptId,
              reason_code: 'bank_payout_failed',
              detail: bankErr instanceof Error ? bankErr.message : 'unknown',
            });
          }
        }
      }

      results.push({
        payout_period_id: row.payout_period_id,
        status: 'transfer_completed',
        stripe_transfer_id: transfer.id,
        amount_minor: amount,
        bank_payout_id: bankPayoutId,
      });
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : 'transfer_failed';
      const code =
        typeof err === 'object' && err && 'code' in err
          ? String((err as { code?: string }).code ?? 'stripe_error')
          : 'stripe_error';
      await admin
        .from('supplier_transfer_attempts')
        .update({
          status: 'transfer_failed',
          error_code: code,
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', attemptId);
      await admin
        .from('supplier_payout_periods')
        .update({ connect_lifecycle: 'failed' })
        .eq('id', row.payout_period_id);
      await admin.from('supplier_payout_exceptions').insert({
        supplier_id: row.supplier_id,
        payout_period_id: row.payout_period_id,
        transfer_attempt_id: attemptId,
        reason_code: code === 'balance_insufficient' ? 'insufficient_funds' : 'transfer_failed',
        detail: msg,
      });
      results.push({
        payout_period_id: row.payout_period_id,
        status: 'transfer_failed',
        error: msg,
        code,
      });
    }
  }

  const batchStatus =
    failed > 0 && succeeded > 0 ? 'partial' : failed > 0 && succeeded === 0 ? 'failed' : 'completed';
  await admin
    .from('supplier_transfer_batches')
    .update({
      status: batchStatus,
      suppliers_considered: (dueRows ?? []).length,
      transfers_attempted: attempted,
      transfers_succeeded: succeeded,
      transfers_failed: failed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', batch.id);

  return json({
    success: true,
    environment: 'test',
    live_money: false,
    dry_run: dryRun,
    batch_id: batch.id,
    liquidity,
    stripe_available_minor: eurAvailable,
    transferable_minor: transferable,
    results,
    summary: { attempted, succeeded, failed },
  });
});
