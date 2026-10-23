/**
 * Mission 2 Phase 2: Stripe Connect Express onboarding (TEST only).
 * Creates/links connected accounts and Account Links. Never marks verified from redirect alone —
 * always re-syncs Account capabilities from Stripe.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';
import { mirrorConnectAccount, connectCanReceiveTransfers } from '../_shared/connect-account-mirror.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

type Body = {
  action?: 'start' | 'refresh' | 'status';
  returnOrigin?: string;
};

function allowlistedOrigin(raw: string | undefined, publicSite: string, extras: string[]): string {
  const candidates = [publicSite, ...extras]
    .map((s) => s.replace(/\/$/, ''))
    .filter(Boolean);
  const origin = (raw ?? '').trim().replace(/\/$/, '');
  if (origin && candidates.some((c) => c === origin)) return origin;
  return candidates[0] || 'https://partner.traverion.com';
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const publicSiteUrl = (Deno.env.get('PARTNER_SITE_URL') ?? Deno.env.get('PUBLIC_SITE_URL') ?? 'https://partner.traverion.com').replace(/\/$/, '');
    const extraOrigins = (Deno.env.get('CHECKOUT_RETURN_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);
    if (!isStripeTestSecretKey(stripeSecret)) {
      return json({ success: false, error: stripeLiveSecretBlockedMessage() }, 503);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ success: false, error: 'Missing Authorization header' }, 401);

    const authed = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const stripe = new Stripe(stripeSecret);

    const [{ data: authData, error: authError }, body] = await Promise.all([
      authed.auth.getUser(),
      req.json().catch(() => ({})) as Promise<Body>,
    ]);
    if (authError || !authData?.user) return json({ success: false, error: 'Unauthorized' }, 401);

    const userId = authData.user.id;
    const action = (body.action ?? 'status') as Body['action'];

    // Team JWT → owner supplier profile (same pattern as other supplier edges)
    const { data: membership } = await admin
      .from('supplier_team_members')
      .select('supplier_id, role')
      .eq('user_id', userId)
      .maybeSingle();

    let supplierId = membership?.supplier_id as string | undefined;
    if (!supplierId) {
      const { data: own } = await admin
        .from('supplier_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      supplierId = own?.id;
    }
    if (!supplierId) return json({ success: false, error: 'Supplier profile not found' }, 404);

    const role = (membership?.role ?? 'owner') as string;
    if (role === 'viewer') {
      return json({ success: false, error: 'Viewers cannot manage payout verification' }, 403);
    }

    const { data: profile, error: profileErr } = await admin
      .from('supplier_profiles')
      .select(
        'id, display_name, company_legal_name, business_type, address_country, stripe_connected_account_id, connect_onboarding_status, connect_charges_enabled, connect_payouts_enabled, connect_details_submitted, connect_disabled_reason, connect_requirements_currently_due, connect_requirements_past_due, connect_default_currency, connect_country, connect_debit_negative_balances, connect_last_synced_at, payout_rail, payment_cycle'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (profileErr || !profile) {
      return json({ success: false, error: profileErr?.message ?? 'Supplier profile not found' }, 404);
    }

    const origin = allowlistedOrigin(body.returnOrigin, publicSiteUrl, extraOrigins);
    const returnUrl = `${origin}/partner/earnings?tab=settings&connect=return`;
    const refreshUrl = `${origin}/partner/earnings?tab=settings&connect=refresh`;

    async function syncAccount(accountId: string) {
      const account = await stripe.accounts.retrieve(accountId);
      const mirror = mirrorConnectAccount(account as Parameters<typeof mirrorConnectAccount>[0]);
      const { error: updErr } = await admin
        .from('supplier_profiles')
        .update({ ...mirror, updated_at: new Date().toISOString() })
        .eq('id', supplierId);
      if (updErr) throw new Error(updErr.message);
      return { account, mirror };
    }

    if (action === 'status' || action === 'refresh') {
      if (profile.stripe_connected_account_id) {
        const { mirror } = await syncAccount(profile.stripe_connected_account_id);
        return json({
          success: true,
          action,
          environment: 'test',
          can_receive_transfers: connectCanReceiveTransfers(mirror),
          account_id: mirror.stripe_connected_account_id,
          onboarding: mirror,
          payout_schedule: profile.payment_cycle === 'biweekly' ? 'Twice monthly (Traverion cadence)' : 'Monthly (Traverion cadence)',
          note: 'Verification status comes from Stripe Account capabilities, not the browser return URL.',
        });
      }
      return json({
        success: true,
        action,
        environment: 'test',
        can_receive_transfers: false,
        account_id: null,
        onboarding: {
          connect_onboarding_status: 'not_started',
          connect_payouts_enabled: false,
          connect_charges_enabled: false,
          connect_details_submitted: false,
          connect_requirements_currently_due: [],
          connect_requirements_past_due: [],
          payout_rail: profile.payout_rail ?? 'manual_iban',
        },
        payout_schedule: profile.payment_cycle === 'biweekly' ? 'Twice monthly (Traverion cadence)' : 'Monthly (Traverion cadence)',
      });
    }

    // action === 'start'
    let accountId = profile.stripe_connected_account_id as string | null;
    if (!accountId) {
      const country = (profile.address_country || profile.connect_country || 'FI').toString().slice(0, 2).toUpperCase();
      const email = authData.user.email ?? undefined;
      const created = await stripe.accounts.create({
        type: 'express',
        country,
        email,
        business_type: profile.business_type === 'individual' ? 'individual' : 'company',
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          traverion_supplier_id: supplierId,
          traverion_environment: 'test',
        },
        settings: {
          payouts: {
            // Automatic bank payouts after funds land on the connected account.
            schedule: { interval: 'daily' },
          },
        },
      });
      accountId = created.id;
      const mirror = mirrorConnectAccount(created as Parameters<typeof mirrorConnectAccount>[0]);
      const { error: insertErr } = await admin
        .from('supplier_profiles')
        .update({
          ...mirror,
          // Keep rail manual until payouts_enabled is confirmed via sync.
          payout_rail: 'manual_iban',
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplierId);
      if (insertErr) throw new Error(insertErr.message);
    } else {
      await syncAccount(accountId);
    }

    const link = await stripe.accountLinks.create({
      account: accountId!,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return json({
      success: true,
      action: 'start',
      environment: 'test',
      account_id: accountId,
      url: link.url,
      expires_at: link.expires_at,
      note: 'Complete Stripe-hosted onboarding. Status updates after Account sync — not from this redirect alone.',
    });
  } catch (e) {
    return json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      500
    );
  }
});
