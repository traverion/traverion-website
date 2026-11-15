/**
 * Phase 5 / P4: refresh supplier earning eligibility (service completion + clearance).
 * Optionally prepares READY payout periods (internal only — no Stripe transfer).
 *
 * prepare_payouts:
 *   true | "manual"     → always call prepare_due_supplier_payouts
 *   "scheduled" | "auto"→ call run_scheduled_supplier_payout_prepare (flag-gated)
 *   omitted / false     → eligibility only
 *
 * Auth: Bearer matching EARNINGS_REFRESH_CRON_SECRET, CRON_SECRET, or
 * BOOKING_REMINDER_CRON_SECRET (same family as other Traverion crons).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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
  if (!cronSecretAuthorized(req)) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'Supabase env missing' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const body = (await req.json().catch(() => ({}))) as {
    prepare_payouts?: boolean | string;
    force_prepare?: boolean;
    now?: string;
  };
  const nowIso =
    typeof body.now === 'string' && body.now.trim() ? body.now.trim() : new Date().toISOString();

  const refresh = await admin.rpc('refresh_supplier_earning_eligibility', { p_now: nowIso });
  if (refresh.error) {
    return json(
      { success: false, error: refresh.error.message, stage: 'refresh_supplier_earning_eligibility' },
      500
    );
  }

  let prepare: unknown = null;
  const prepMode = body.prepare_payouts;
  const wantScheduled =
    prepMode === 'scheduled' || prepMode === 'auto' || prepMode === 'scheduler';
  const wantManual = prepMode === true || prepMode === 'manual';

  if (wantScheduled) {
    const prep = await admin.rpc('run_scheduled_supplier_payout_prepare', {
      p_now: nowIso,
      p_triggered_by: 'scheduler:refresh-supplier-earnings',
      p_force: body.force_prepare === true,
    });
    if (prep.error) {
      return json(
        {
          success: false,
          error: prep.error.message,
          stage: 'run_scheduled_supplier_payout_prepare',
          refresh: refresh.data,
        },
        500
      );
    }
    prepare = prep.data;
  } else if (wantManual) {
    const prep = await admin.rpc('prepare_due_supplier_payouts', { p_now: nowIso });
    if (prep.error) {
      return json(
        {
          success: false,
          error: prep.error.message,
          stage: 'prepare_due_supplier_payouts',
          refresh: refresh.data,
        },
        500
      );
    }
    const utcDay = new Date(nowIso).getUTCDate();
    await admin.from('supplier_payout_prepare_runs').insert({
      triggered_by: 'manual:refresh-supplier-earnings',
      trigger_note: 'manual prepare_due (no bank transfer)',
      p_now: nowIso,
      utc_day: utcDay,
      auto_prepare_enabled: false,
      ok: true,
      result: prep.data ?? {},
    });
    await admin.from('financial_audit_log').insert({
      action: 'prepare_due_supplier_payouts',
      reason: 'Manual payout preparation run (READY only — no bank transfer)',
      after_state: { triggered_by: 'manual:refresh-supplier-earnings', result: prep.data },
    });
    prepare = prep.data;
  }

  return json({
    success: true,
    refresh: refresh.data,
    prepare,
    stripe_transfer: false,
    note:
      'Eligibility by default; scheduled prepare respects payout_auto_prepare_enabled; never bank transfer',
  });
});
