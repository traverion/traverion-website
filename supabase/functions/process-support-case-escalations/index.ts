/**
 * Phase 4: escalate overdue operator_no_show support cases (48h, no auto-refund).
 * Auth: CANCEL_RESOLUTION_CRON_SECRET | CRON_SECRET | BOOKING_REMINDER_CRON_SECRET
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  if (!cronSecretAuthorized(req)) return json({ success: false, error: 'Unauthorized' }, 401);

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

  const { data, error } = await admin.rpc('process_overdue_booking_support_cases', {
    p_limit: limit,
  });
  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true, result: data });
});
