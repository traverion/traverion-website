/**
 * Phase 3: server-side cancel resolution cron.
 * 1) Claim pending_customer_choice past official start → full_refund + instruction
 * 2) Drain eligible cancel-refund instructions via execute-booking-refund recover
 *
 * Auth: Bearer matching CANCEL_RESOLUTION_CRON_SECRET, CRON_SECRET, or
 * BOOKING_REMINDER_CRON_SECRET (same pattern as expire-stay-booking-requests).
 * No browser timers — GitHub Actions schedule every 5 minutes.
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
  // Service-role bearer allowed for ops smoke tests (same key never ships to browsers).
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (serviceRole && bearer === serviceRole) return true;
  const candidates = [
    Deno.env.get('CANCEL_RESOLUTION_CRON_SECRET')?.trim(),
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
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(Math.floor(body.limit), 100))
      : 50;

  const deadlines = await admin.rpc('process_pending_supplier_cancel_deadlines', {
    p_limit: limit,
  });
  if (deadlines.error) {
    return json(
      { success: false, error: deadlines.error.message, stage: 'process_pending_supplier_cancel_deadlines' },
      500
    );
  }

  // Drain Phase 2+3 refund instructions (Stripe execute). Nested recover is service-role only.
  let recover: { success?: boolean; error?: string; results?: unknown } | null = null;
  try {
    const nested = await fetch(`${supabaseUrl}/functions/v1/execute-booking-refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recover: true, limit }),
    });
    recover = (await nested.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      results?: unknown;
    };
    if (!nested.ok) {
      return json(
        {
          success: false,
          error: recover?.error ?? `execute-booking-refund HTTP ${nested.status}`,
          stage: 'recover_refunds',
          deadlines: deadlines.data,
        },
        500
      );
    }
  } catch (e) {
    return json(
      {
        success: false,
        error: e instanceof Error ? e.message : 'recover_failed',
        stage: 'recover_refunds',
        deadlines: deadlines.data,
      },
      500
    );
  }

  return json({
    success: true,
    deadlines: deadlines.data,
    refunds: recover,
  });
});
