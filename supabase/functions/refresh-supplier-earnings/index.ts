/**
 * Phase 5: refresh supplier earning eligibility (service completion + clearance).
 * Optionally prepares READY payout periods (internal only — no Stripe transfer).
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
    prepare_payouts?: boolean;
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
  if (body.prepare_payouts === true) {
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
    prepare = prep.data;
  }

  return json({
    success: true,
    refresh: refresh.data,
    prepare,
    stripe_transfer: false,
    note: 'Eligibility only by default; prepare_payouts creates READY periods with no Stripe bank payout',
  });
});
