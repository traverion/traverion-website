/**
 * Stripe Connect onboarding for Traverion suppliers (TEST or LIVE).
 *
 * New suppliers, TEST and LIVE: Accounts v2 recipient, dashboard none,
 * platform-collected requirements. LIVE creation uses the same body and
 * requires the disabled gate plus an allowlist row before any Stripe call.
 * A rejected v2 create does not fall back to Express or legacy Custom.
 *
 * Legacy Express accounts: Account Session embedded components (or hosted
 * Account Link fallback). Never silently recreate Express → Custom.
 *
 * LIVE platform never reuses TEST connected-account IDs. Orphan TEST links are
 * archived to connect_legacy_account_id and a new LIVE account is created.
 *
 * Verification status always comes from Account sync / webhooks — never from
 * form submission alone. Do not show Verified unless LIVE capabilities confirm it.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { resolveStripeMoneySecretFromEnv } from '../_shared/resolve-stripe-money-secret.ts';
import { isStripeTestPublishableKey, isStripeLivePublishableKey } from '../_shared/stripe-payment-mode.ts';
import { mirrorConnectAccount, connectCanReceiveTransfers } from '../_shared/connect-account-mirror.ts';
import { liveCustomCreateAllowed } from '../_shared/live-custom-onboarding-gate.ts';
import {
  ACCOUNTS_V2_STRIPE_VERSION,
  V2_RETRIEVE_INCLUDE,
  assertV2RecipientConfig,
  buildV2RecipientCreateBody,
  finlandSupplierCountry,
  isAccountsV2Native,
  v2StripeTransfersStatus,
  type V2AccountSnapshot,
} from '../_shared/accounts-v2-config.ts';
import { STRIPE_RECIPIENT_AGREEMENT } from '../_shared/stripe-recipient-agreement.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** Supplier-facing copy for LIVE create blocks (no internal gate jargon). */
function supplierFacingLiveCreateBlock(raw: string | null | undefined): string {
  const msg = (raw ?? '').trim();
  if (/turned off|not enabled/i.test(msg)) {
    return 'Payout connection is not open for your account yet. Your details stay saved.';
  }
  if (/not approved for LIVE/i.test(msg)) {
    return 'Payout connection is being prepared for your account. Your details stay saved.';
  }
  if (/business verification/i.test(msg)) {
    return 'Finish Traverion business verification first. You can keep saving your payout details meanwhile.';
  }
  if (/pilot approval/i.test(msg)) {
    return 'Payout connection is being prepared for your account. Your details stay saved.';
  }
  return msg || 'Payout connection is not open for your account yet. Your details stay saved.';
}

type Body = {
  action?:
    | 'start'
    | 'refresh'
    | 'status'
    | 'account_session'
    | 'account_link'
    | 'ensure_account'
    | 'start_native_custom'
    | 'submit_business'
    | 'submit_representative'
    | 'submit_beneficial_owners'
    | 'accept_tos'
    | 'attach_bank_token'
    | 'submit_identity_file'
    | 'upload_identity_document'
    /** Persist non-sensitive wizard progress (no IBAN / tokens / full DOB). */
    | 'save_wizard_draft'
    /** Service-role only: archive TEST link + create LIVE Custom account + Account Link. */
    | 'admin_ensure_live_connect';
  supplier_id?: string;
  /** Non-sensitive payout wizard draft — stripped server-side before write. */
  wizard_draft?: Record<string, unknown>;
  /** Required confirmation for archiving an Express link before Custom create (TEST). */
  confirm_archive_express?: boolean;
  component?: 'account_onboarding' | 'account_management';
  returnOrigin?: string;
  business?: {
    legal_name?: string;
    business_type?: 'company' | 'individual';
    tax_id?: string;
    registration_number?: string;
    phone?: string;
    url?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      postal_code?: string;
      country?: string;
      state?: string;
    };
  };
  representative?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    title?: string;
    dob?: { day?: number; month?: number; year?: number };
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      postal_code?: string;
      country?: string;
      state?: string;
    };
    relationship?: {
      owner?: boolean;
      percent_ownership?: number | null;
      executive?: boolean;
      director?: boolean;
    };
  };
  owners?: Array<{
    first_name?: string;
    last_name?: string;
    email?: string;
    dob?: { day?: number; month?: number; year?: number };
    percent_ownership?: number | null;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      postal_code?: string;
      country?: string;
      state?: string;
    };
  }>;
  bank_token?: string;
  identity?: {
    person_id?: string;
    file_id?: string;
    side?: 'front' | 'back';
  };
  /** Ephemeral identity upload — never persisted in Traverion storage. */
  identity_upload?: {
    person_id?: string;
    side?: 'front' | 'back';
    filename?: string;
    content_type?: string;
    content_base64?: string;
  };
  tos_accepted?: boolean;
  agreement_version?: string;
};

const PARTNER_PORTAL_ORIGIN = 'https://partner.traverion.com';

/** Connect Account Link returns must land on the partner portal, never the marketing site alone. */
function allowlistedOrigin(raw: string | undefined, publicSite: string, extras: string[]): string {
  const candidates = [PARTNER_PORTAL_ORIGIN, publicSite, ...extras]
    .map((s) => s.replace(/\/$/, ''))
    .filter(Boolean);
  const unique = [...new Set(candidates)];
  const origin = (raw ?? '').trim().replace(/\/$/, '');
  if (origin && unique.some((c) => c === origin)) return origin;
  if (unique.includes(PARTNER_PORTAL_ORIGIN)) return PARTNER_PORTAL_ORIGIN;
  return unique[0] || PARTNER_PORTAL_ORIGIN;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return '0.0.0.0';
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
    // Prefer STRIPE_PUBLISHABLE_KEY; fall back to VITE_STRIPE_PUBLISHABLE_KEY (already set in LIVE secrets).
    const publishableKey = (
      Deno.env.get('STRIPE_PUBLISHABLE_KEY') ??
      Deno.env.get('VITE_STRIPE_PUBLISHABLE_KEY') ??
      ''
    ).trim();
    // Prefer explicit partner portal URL for Connect returns; PUBLIC_SITE_URL may be www.
    const publicSiteUrl = (
      Deno.env.get('PARTNER_SITE_URL') ??
      PARTNER_PORTAL_ORIGIN
    ).replace(/\/$/, '');
    const extraOrigins = [
      ...(Deno.env.get('CHECKOUT_RETURN_ORIGINS') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      Deno.env.get('PUBLIC_SITE_URL')?.replace(/\/$/, '') ?? '',
      PARTNER_PORTAL_ORIGIN,
    ].filter(Boolean);

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    const stripeMoney = resolveStripeMoneySecretFromEnv(Deno.env);
    if (!stripeMoney.ok) return json({ success: false, error: stripeMoney.error }, stripeMoney.status);
    const stripeSecret = stripeMoney.secret;
    if (publishableKey) {
      const pkOk =
        (stripeMoney.mode === 'test' && isStripeTestPublishableKey(publishableKey)) ||
        (stripeMoney.mode === 'live' && isStripeLivePublishableKey(publishableKey));
      if (!pkOk) {
        return json(
          {
            success: false,
            error: `Publishable key must match payment mode (${stripeMoney.mode})`,
          },
          503
        );
      }
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ success: false, error: 'Missing Authorization header' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const stripe = new Stripe(stripeSecret);
    const platformMode = stripeMoney.mode; // 'test' | 'live'

    async function stripeV2(method: string, path: string, body?: unknown, idempotencyKey?: string) {
      const response = await fetch(`https://api.stripe.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          'Stripe-Version': ACCOUNTS_V2_STRIPE_VERSION,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        const raw = String(payload?.error?.message || 'Accounts v2 request failed');
        const message = /limit must be greater than 0/i.test(raw)
          ? 'We could not save this person. Your place in the form is unchanged — try again.'
          : /\d{6,}|acct_|req_|parameter/i.test(raw)
            ? 'We could not save that step. Your details are still here — try again.'
            : raw.slice(0, 180);
        throw new Error(message);
      }
      return payload as V2AccountSnapshot;
    }

    type V2PersonRecord = {
      id?: string;
      given_name?: string | null;
      surname?: string | null;
      relationship?: { representative?: boolean; owner?: boolean } | null;
    };

    async function listV2Persons(accountId: string): Promise<V2PersonRecord[]> {
      const people: V2PersonRecord[] = [];
      let page: string | null = null;
      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const params = new URLSearchParams({ limit: '20' });
        if (page) params.set('page', page);
        const listed = (await stripeV2(
          'GET',
          `/v2/core/accounts/${accountId}/persons?${params.toString()}`
        )) as { data?: V2PersonRecord[]; next_page?: string | null; next_page_url?: string | null };
        if (Array.isArray(listed.data)) people.push(...listed.data);
        let next: string | null = null;
        if (typeof listed.next_page === 'string' && listed.next_page.trim()) next = listed.next_page.trim();
        else if (typeof listed.next_page_url === 'string' && listed.next_page_url.includes('page=')) {
          try {
            next = new URL(listed.next_page_url, 'https://api.stripe.com').searchParams.get('page');
          } catch {
            next = null;
          }
        }
        if (!next || seen.has(next)) break;
        seen.add(next);
        page = next;
      }
      return people;
    }

    function v2PersonBody(input: {
      first_name: string;
      last_name: string;
      email?: string;
      phone?: string;
      dob: { day: number; month: number; year: number };
      address: {
        line1?: string;
        line2?: string;
        city?: string;
        postal_code?: string;
        state?: string;
        country: string;
      };
      relationship: {
        representative: boolean;
        director: boolean;
        executive: boolean;
        owner: boolean;
        percent_ownership?: number;
        title: string;
      };
    }) {
      const ownership = input.relationship.percent_ownership;
      const owner = input.relationship.owner && ownership != null && ownership > 0;
      return {
        given_name: input.first_name,
        surname: input.last_name,
        email: input.email,
        phone: input.phone,
        date_of_birth: input.dob,
        address: {
          line1: input.address.line1,
          line2: input.address.line2,
          city: input.address.city,
          postal_code: input.address.postal_code,
          state: input.address.state,
          country: input.address.country.toLowerCase(),
        },
        relationship: {
          representative: input.relationship.representative,
          director: input.relationship.director,
          executive: input.relationship.executive,
          owner,
          ...(owner && ownership != null ? { percent_ownership: String(ownership) } : {}),
          title: input.relationship.title,
        },
      };
    }

    async function saveV2Person(
      accountId: string,
      body: ReturnType<typeof v2PersonBody>,
      match: (person: V2PersonRecord) => boolean,
      idempotencyKey?: string
    ): Promise<string> {
      const people = await listV2Persons(accountId);
      const existing = people.find(match);
      const saved = existing?.id
        ? await stripeV2('POST', `/v2/core/accounts/${accountId}/persons/${existing.id}`, body)
        : await stripeV2('POST', `/v2/core/accounts/${accountId}/persons`, body, idempotencyKey);
      const personId = (saved as { id?: string }).id;
      if (!personId) throw new Error('Stripe did not return a person id');
      return personId;
    }

    function v2RetrievePath(accountId: string): string {
      const include = V2_RETRIEVE_INCLUDE.map((item) => `include=${encodeURIComponent(item)}`).join('&');
      return `/v2/core/accounts/${accountId}?${include}`;
    }

    /**
     * The only account-creation call. LIVE checks the gate again immediately
     * before the request. Failure releases nothing here; callers release the claim.
     */
    async function createAccountsV2Supplier(input: {
      supplierId: string;
      email?: string;
      displayName: string;
      entityType: 'individual' | 'company';
      countryRaw: string;
    }): Promise<{ id: string; mirror: ReturnType<typeof mirrorConnectAccount> }> {
      if (platformMode === 'live') {
        const createGate = await assertLiveCustomCreateAllowed(input.supplierId);
        if (!createGate.allowed) throw new Error(createGate.reason);
      }
      if (platformMode !== 'live' && platformMode !== 'test') {
        throw new Error('Accounts v2 creation is only available in TEST or LIVE.');
      }
      const country = finlandSupplierCountry(input.countryRaw);
      if (!country) throw new Error('Accounts v2 onboarding is available for Finnish suppliers.');
      const createBody = buildV2RecipientCreateBody({
        email: input.email,
        displayName: input.displayName,
        supplierId: input.supplierId,
        environment: platformMode,
      });
      (createBody.identity as { entity_type: string }).entity_type = input.entityType;
      const created = await stripeV2(
        'POST',
        '/v2/core/accounts',
        createBody,
        `traverion-v2:${input.supplierId}:${platformMode}`
      );
      const check = assertV2RecipientConfig(created);
      const modeMismatch =
        (platformMode === 'test' && created.livemode === true) ||
        (platformMode === 'live' && created.livemode === false);
      const owner = (created.metadata?.traverion_supplier_id ?? '').trim();
      if (!check.ok || modeMismatch || !created.id || (owner && owner !== input.supplierId)) {
        throw new Error(
          `Accounts v2 configuration was rejected (${check.ok ? 'livemode or ownership' : check.problems.join(', ')}). No legacy account was created.`
        );
      }
      const retrieved = await stripe.accounts.retrieve(created.id);
      const mirror = mirrorConnectAccount(retrieved as Parameters<typeof mirrorConnectAccount>[0]);
      return {
        id: created.id,
        mirror: {
          ...mirror,
          connect_account_type: 'custom',
          connect_account_livemode: platformMode === 'live',
        },
      };
    }
    const body = (await req.json().catch(() => ({}))) as Body;

    async function readLiveCreateEligibility(targetSupplierId: string): Promise<{
      live_gate_enabled: boolean;
      supplier_allowlisted: boolean;
      live_create_allowed: boolean;
      live_create_blocked_reason: string | null;
      business_verified: boolean;
      pilot_approved: boolean;
    }> {
      if (platformMode !== 'live') {
        return {
          live_gate_enabled: false,
          supplier_allowlisted: false,
          live_create_allowed: true,
          live_create_blocked_reason: null,
          business_verified: true,
          pilot_approved: true,
        };
      }
      const { data: flagRow, error: flagErr } = await admin
        .from('commercial_runtime_config')
        .select('value_int')
        .eq('key', 'live_custom_onboarding_enabled')
        .maybeSingle();
      const flagValue = flagErr ? 0 : (flagRow?.value_int as number | undefined);
      const liveGateEnabled = Number(flagValue) === 1;
      const { data: allowRow, error: allowErr } = await admin
        .from('live_custom_onboarding_allowlist')
        .select('supplier_id')
        .eq('supplier_id', targetSupplierId)
        .maybeSingle();
      const supplierAllowlisted = !allowErr && Boolean(allowRow?.supplier_id);
      const decision = liveCustomCreateAllowed({
        platformMode,
        flagValue: flagErr ? 0 : flagValue,
        supplierApproved: supplierAllowlisted,
      });
      const businessVerified =
        String(profile.verification_status ?? '')
          .trim()
          .toLowerCase() === 'verified';
      const { data: pilotRow } = await admin
        .from('live_accounts_v2_pilot_approvals')
        .select('supplier_id')
        .eq('supplier_id', targetSupplierId)
        .maybeSingle();
      const pilotApproved = Boolean(pilotRow?.supplier_id);
      let blocked: string | null = decision.allowed
        ? null
        : supplierFacingLiveCreateBlock(
            decision.reason ?? 'LIVE payout account creation is turned off.'
          );
      if (!blocked && !businessVerified) {
        blocked =
          'Finish Traverion business verification first. You can keep saving your payout details meanwhile.';
      }
      if (!blocked && !pilotApproved) {
        blocked =
          'Payout connection is being prepared for your account. Your details stay saved until it opens.';
      }
      return {
        live_gate_enabled: liveGateEnabled,
        supplier_allowlisted: supplierAllowlisted,
        live_create_allowed: decision.allowed && businessVerified && pilotApproved,
        live_create_blocked_reason: blocked,
        business_verified: businessVerified,
        pilot_approved: pilotApproved,
      };
    }

    async function assertLiveCustomCreateAllowed(targetSupplierId: string): Promise<
      { allowed: true } | { allowed: false; reason: string }
    > {
      const eligibility = await readLiveCreateEligibility(targetSupplierId);
      return eligibility.live_create_allowed
        ? { allowed: true }
        : {
            allowed: false,
            reason: supplierFacingLiveCreateBlock(
              eligibility.live_create_blocked_reason ?? 'LIVE payout account creation is turned off.'
            ),
          };
    }

    /** Strip secrets before persisting — never store IBAN, tokens, or full DOB. */
    function sanitizeWizardDraft(raw: unknown): Record<string, unknown> {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const src = raw as Record<string, unknown>;
      const step = typeof src.step === 'string' ? src.step : 'business';
      const markers =
        src.markers && typeof src.markers === 'object' && !Array.isArray(src.markers)
          ? (src.markers as Record<string, unknown>)
          : {};
      const repIn =
        src.rep && typeof src.rep === 'object' && !Array.isArray(src.rep)
          ? (src.rep as Record<string, unknown>)
          : {};
      const ownersIn = Array.isArray(src.owners) ? src.owners : [];
      const redactDobYear = (value: unknown): number | null => {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 1900 && value <= 2100) {
          return Math.trunc(value);
        }
        if (typeof value === 'string') {
          const m = /^(\d{4})/.exec(value.trim());
          if (m) {
            const y = Number(m[1]);
            if (y >= 1900 && y <= 2100) return y;
          }
        }
        return null;
      };
      return {
        version: 1,
        step,
        rep: {
          first_name: typeof repIn.first_name === 'string' ? repIn.first_name.slice(0, 80) : '',
          last_name: typeof repIn.last_name === 'string' ? repIn.last_name.slice(0, 80) : '',
          email: typeof repIn.email === 'string' ? repIn.email.slice(0, 120) : '',
          phone: typeof repIn.phone === 'string' ? repIn.phone.slice(0, 40) : '',
          title: typeof repIn.title === 'string' ? repIn.title.slice(0, 80) : '',
          is_owner: Boolean(repIn.is_owner),
          is_director: Boolean(repIn.is_director),
          verification_consent: Boolean(repIn.verification_consent),
          percent_ownership:
            typeof repIn.percent_ownership === 'string' ? repIn.percent_ownership.slice(0, 8) : '',
          dob_year: redactDobYear(repIn.dob_year ?? repIn.dob),
        },
        owners: ownersIn.slice(0, 8).map((owner) => {
          const o =
            owner && typeof owner === 'object' && !Array.isArray(owner)
              ? (owner as Record<string, unknown>)
              : {};
          return {
            id: typeof o.id === 'string' ? o.id.slice(0, 64) : '',
            first_name: typeof o.first_name === 'string' ? o.first_name.slice(0, 80) : '',
            last_name: typeof o.last_name === 'string' ? o.last_name.slice(0, 80) : '',
            email: typeof o.email === 'string' ? o.email.slice(0, 120) : '',
            percent_ownership:
              typeof o.percent_ownership === 'string' ? o.percent_ownership.slice(0, 8) : '',
            dob_year: redactDobYear(o.dob_year ?? o.dob),
          };
        }),
        tos_accepted_intent: Boolean(src.tos_accepted_intent ?? src.tos_accepted),
        stripe_auth_acknowledged: Boolean(src.stripe_auth_acknowledged),
        payment_cycle:
          src.payment_cycle === 'monthly' || src.payment_cycle === 'biweekly'
            ? src.payment_cycle
            : '',
        payout_threshold_min:
          typeof src.payout_threshold_min === 'string' ? src.payout_threshold_min.slice(0, 16) : '',
        markers: {
          businessSavedAt:
            typeof markers.businessSavedAt === 'string' ? markers.businessSavedAt : null,
          representativeSavedAt:
            typeof markers.representativeSavedAt === 'string'
              ? markers.representativeSavedAt
              : null,
          identitySavedAt:
            typeof markers.identitySavedAt === 'string' ? markers.identitySavedAt : null,
          bankDeferredAt:
            typeof markers.bankDeferredAt === 'string' ? markers.bankDeferredAt : null,
          bankSavedAt: typeof markers.bankSavedAt === 'string' ? markers.bankSavedAt : null,
          bankLast4:
            typeof markers.bankLast4 === 'string'
              ? markers.bankLast4.replace(/\D/g, '').slice(-4) || null
              : null,
          preferencesSavedAt:
            typeof markers.preferencesSavedAt === 'string' ? markers.preferencesSavedAt : null,
          wizardCompletedAt:
            typeof markers.wizardCompletedAt === 'string' ? markers.wizardCompletedAt : null,
        },
      };
    }

    async function claimConnectCreate(targetSupplierId: string): Promise<{
      action: 'create' | 'reuse' | 'in_progress' | 'refuse';
      account_id?: string;
    }> {
      const { data, error } = await admin.rpc('claim_connect_account_create', {
        p_supplier_id: targetSupplierId,
      });
      if (error || !data || typeof data !== 'object') {
        return { action: 'refuse' };
      }
      const row = data as { action?: string; account_id?: string };
      if (row.action === 'create' || row.action === 'reuse' || row.action === 'in_progress') {
        return { action: row.action, account_id: row.account_id };
      }
      return { action: 'refuse' };
    }

    async function releaseConnectCreateClaim(targetSupplierId: string) {
      await admin
        .from('supplier_profiles')
        .update({ connect_create_claimed_at: null })
        .eq('id', targetSupplierId)
        .is('stripe_connected_account_id', null);
    }
    const action = (body.action ?? 'status') as NonNullable<Body['action']>;

    const bearer = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const bootstrapSecret = (Deno.env.get('P81_LIVE_CONNECT_BOOTSTRAP_SECRET') ?? '').trim();
    const serviceRoleAuthorized = Boolean(
      bearer &&
        (bearer === serviceRoleKey ||
          (bootstrapSecret.length > 0 && bearer === bootstrapSecret))
    );

    // --- Service-role / bootstrap LIVE Connect ensure (P8.1) ---
    if (action === 'admin_ensure_live_connect') {
      if (!serviceRoleAuthorized) {
        return json({ success: false, error: 'Unauthorized' }, 401);
      }
      if (platformMode !== 'live') {
        return json({
          success: false,
          error: 'admin_ensure_live_connect requires LIVE Stripe platform secret',
          platform_mode: platformMode,
        }, 503);
      }
      const targetSupplierId = (body.supplier_id ?? '').trim();
      if (!targetSupplierId) {
        return json({ success: false, error: 'supplier_id required' }, 400);
      }

      const { data: targetProfile, error: targetErr } = await admin
        .from('supplier_profiles')
        .select(
          'id, display_name, company_legal_name, business_type, address_street, address_city, address_postal_code, address_country, contact_phone, company_registration_number, tax_id, stripe_connected_account_id, connect_account_type, connect_legacy_account_id, connect_account_livemode, connect_onboarding_status, connect_country, payout_rail'
        )
        .eq('id', targetSupplierId)
        .maybeSingle();
      if (targetErr || !targetProfile) {
        return json({ success: false, error: targetErr?.message ?? 'Supplier not found' }, 404);
      }

      let existingId = (targetProfile.stripe_connected_account_id as string | null) ?? null;
      let archivedTestId: string | null =
        (targetProfile.connect_legacy_account_id as string | null) ?? null;

      if (existingId) {
        try {
          const existing = await stripe.accounts.retrieve(existingId);
          if ((existing as { livemode?: boolean }).livemode === true) {
            const mirror = mirrorConnectAccount(existing as Parameters<typeof mirrorConnectAccount>[0]);
            await admin
              .from('supplier_profiles')
              .update({ ...mirror, updated_at: new Date().toISOString() })
              .eq('id', targetSupplierId);
            const link = await stripe.accountLinks.create({
              account: existingId,
              refresh_url: `${publicSiteUrl}/partner/onboarding?phase=status&connect=refresh`,
              return_url: `${publicSiteUrl}/partner/onboarding?phase=status&connect=return`,
              type: 'account_onboarding',
            });
            return json({
              success: true,
              action: 'admin_ensure_live_connect',
              created: false,
              environment: 'live',
              account_id: existingId,
              onboarding: mirror,
              account_link_url: link.url,
              account_link_expires_at: link.expires_at,
              note: 'Existing LIVE connected account reused — supplier must finish Stripe onboarding if incomplete.',
            });
          }
          // Retrievable but not LIVE → archive (should be rare with LIVE key)
          archivedTestId = existingId;
        } catch {
          // Not retrievable on LIVE platform → treat as TEST orphan
          archivedTestId = existingId;
        }

        await admin
          .from('supplier_profiles')
          .update({
            connect_legacy_account_id: archivedTestId,
            stripe_connected_account_id: null,
            connect_account_type: null,
            connect_account_livemode: false,
            connect_onboarding_status: 'not_started',
            connect_charges_enabled: false,
            connect_payouts_enabled: false,
            connect_details_submitted: false,
            connect_disabled_reason: 'archived_test_account_pending_live_onboarding',
            connect_requirements_currently_due: [],
            connect_requirements_past_due: [],
            payout_rail: 'manual_iban',
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetSupplierId);
        existingId = null;
      }

      const { data: userRow } = await admin.auth.admin.getUserById(targetSupplierId);
      const email = userRow?.user?.email ?? undefined;
      const isIndividual = targetProfile.business_type === 'individual';

      const createGate = await assertLiveCustomCreateAllowed(targetSupplierId);
      if (!createGate.allowed) {
        return json({
          success: false,
          error: createGate.reason,
          created: false,
          environment: 'live',
        }, 403);
      }

      // Same v2 body as supplier onboarding. A failed create must not mint Express or Custom.
      let created: { id: string; mirror: ReturnType<typeof mirrorConnectAccount> };
      try {
        created = await createAccountsV2Supplier({
          supplierId: targetSupplierId,
          email,
          displayName:
            targetProfile.display_name ||
            targetProfile.company_legal_name ||
            email ||
            'Traverion supplier',
          entityType: isIndividual ? 'individual' : 'company',
          countryRaw: (targetProfile.address_country as string | null) || '',
        });
      } catch (v2Err) {
        const detail = v2Err instanceof Error ? v2Err.message : String(v2Err);
        return json({
          success: false,
          error: 'LIVE Accounts v2 account could not be created. No legacy account was created.',
          created: false,
          detail: detail.slice(0, 160),
        }, 502);
      }

      const mirrorLive = created.mirror;
      const { error: updErr } = await admin
        .from('supplier_profiles')
        .update({
          ...mirrorLive,
          connect_legacy_account_id: archivedTestId,
          payout_rail: 'manual_iban',
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetSupplierId);
      if (updErr) return json({ success: false, error: updErr.message }, 500);

      await admin.from('financial_audit_log').insert({
        action: 'p81_create_live_connect_account',
        supplier_id: targetSupplierId,
        amount_minor: 0,
        currency: 'EUR',
        reason: 'Created LIVE Accounts v2 recipient; onboarding incomplete until Stripe confirms',
        provider_ref: created.id,
        after_state: {
          account_id: created.id,
          account_type: 'v2',
          archived_test_account_id: archivedTestId,
          connect_onboarding_status: mirrorLive.connect_onboarding_status,
          connect_account_livemode: true,
        },
      });

      return json({
        success: true,
        action: 'admin_ensure_live_connect',
        created: true,
        environment: 'live',
        account_id: created.id,
        account_type: 'custom',
        archived_test_account_id: archivedTestId,
        onboarding: mirrorLive,
        charges_enabled: mirrorLive.connect_charges_enabled,
        payouts_enabled: mirrorLive.connect_payouts_enabled,
        details_submitted: mirrorLive.connect_details_submitted,
        connect_onboarding_status: mirrorLive.connect_onboarding_status,
        note: 'LIVE Accounts v2 account created. Not Verified until stripe_transfers is active.',
      });
    }

    const authed = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authed.auth.getUser();
    if (authError || !authData?.user) return json({ success: false, error: 'Unauthorized' }, 401);

    const userId = authData.user.id;

    const { data: membershipRowsRaw, error: membershipErr } = await admin
      .from('supplier_team_members')
      .select('supplier_id, role')
      .eq('user_id', userId);
    if (membershipErr) {
      return json({ success: false, error: 'Could not resolve supplier organization' }, 500);
    }

    const membershipRows = membershipRowsRaw ?? [];
    let supplierId: string | undefined;
    if (membershipRows.length === 1) {
      supplierId = membershipRows[0]?.supplier_id as string | undefined;
    } else if (membershipRows.length > 1) {
      const ownMembership = membershipRows.find((row) => row.supplier_id === userId);
      const owners = membershipRows.filter((row) => row.role === 'owner');
      if (ownMembership) supplierId = ownMembership.supplier_id as string;
      else if (owners.length === 1) supplierId = owners[0]?.supplier_id as string;
      else {
        return json({ success: false, error: 'Multiple supplier organizations are linked to this login.' }, 409);
      }
    }
    if (!supplierId) {
      const { data: own } = await admin
        .from('supplier_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      supplierId = own?.id;
    }
    if (!supplierId) return json({ success: false, error: 'Supplier profile not found' }, 404);

    const role = (membershipRows.find((row) => row.supplier_id === supplierId)?.role ?? 'owner') as string;
    if (role === 'viewer') {
      return json({ success: false, error: 'Viewers cannot manage payout verification' }, 403);
    }

    const { data: profile, error: profileErr } = await admin
      .from('supplier_profiles')
      .select(
        'id, display_name, company_legal_name, business_type, address_street, address_city, address_postal_code, address_country, contact_phone, company_registration_number, tax_id, verification_status, company_registration_document_path, verification_submitted_at, stripe_connected_account_id, connect_account_type, connect_legacy_account_id, connect_account_livemode, connect_onboarding_status, connect_charges_enabled, connect_payouts_enabled, connect_details_submitted, connect_disabled_reason, connect_requirements_currently_due, connect_requirements_past_due, connect_default_currency, connect_country, connect_debit_negative_balances, connect_last_synced_at, payout_rail, payment_cycle, payout_wizard_draft, payout_wizard_draft_updated_at'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (profileErr || !profile) {
      return json({ success: false, error: profileErr?.message ?? 'Supplier profile not found' }, 404);
    }

    const origin = allowlistedOrigin(body.returnOrigin, publicSiteUrl, extraOrigins);
    // P9.44: return suppliers to the unified onboarding shell (not a separate money settings hop).
    const returnUrl = `${origin}/partner/onboarding?phase=status&connect=return`;
    const refreshUrl = `${origin}/partner/onboarding?phase=status&connect=refresh`;
    const ip = clientIp(req);

    let latestStripeTransfersStatus: string | undefined;

    async function nativeV2Account(accountId: string): Promise<V2AccountSnapshot | null> {
      const v2 = await stripeV2('GET', v2RetrievePath(accountId)).catch(() => null);
      if (!isAccountsV2Native(v2)) return null;
      if (platformMode === 'test' && v2.livemode === true) {
        throw new Error('LIVE connected accounts cannot be used on TEST Traverion.');
      }
      if (platformMode === 'live' && v2.livemode === false) {
        throw new Error('TEST connected accounts cannot be used on LIVE Traverion.');
      }
      return v2;
    }

    async function persistMirror(mirror: ReturnType<typeof mirrorConnectAccount>) {
      const { error: updErr } = await admin
        .from('supplier_profiles')
        .update({ ...mirror, updated_at: new Date().toISOString() })
        .eq('id', supplierId);
      if (updErr) throw new Error(updErr.message);
    }

    async function syncAccount(accountId: string) {
      latestStripeTransfersStatus = undefined;
      let account: Stripe.Account;
      try {
        account = await stripe.accounts.retrieve(accountId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // LIVE platform cannot retrieve TEST accounts — archive and force re-onboard.
        if (platformMode === 'live') {
          await archiveLinkedAccount(accountId);
          throw new Error(
            `Connected account ${accountId} is not available on LIVE Stripe (archived). Start LIVE onboarding again.`
          );
        }
        throw new Error(msg);
      }
      // Ownership: only allow accounts tagged to this supplier (or legacy untagged during TEST).
      const metaSupplier = (account.metadata?.traverion_supplier_id ?? '').trim();
      if (metaSupplier && metaSupplier !== supplierId) {
        throw new Error('Connected account does not belong to this supplier organization');
      }
      if (!metaSupplier && platformMode === 'live') {
        const linkedHere = profile.stripe_connected_account_id === accountId;
        const expressLegacy =
          linkedHere &&
          ((account.type as string) === 'express' || profile.connect_account_type === 'express');
        if (!expressLegacy) {
          throw new Error('Connected account is missing supplier ownership metadata');
        }
      }
      if (platformMode === 'live' && (account as { livemode?: boolean }).livemode === false) {
        await archiveLinkedAccount(accountId);
        throw new Error('TEST connected accounts cannot be used on LIVE Traverion. Start LIVE onboarding again.');
      }
      if (platformMode === 'test' && (account as { livemode?: boolean }).livemode === true) {
        throw new Error('LIVE connected accounts cannot be used on TEST Traverion.');
      }
      if (account.metadata?.traverion_account_api === 'v2') {
        const v2 = await stripeV2('GET', v2RetrievePath(accountId)).catch(() => null);
        if (platformMode === 'test' && v2?.livemode === true) {
          throw new Error('LIVE connected accounts cannot be used on TEST Traverion.');
        }
        if (platformMode === 'live' && v2?.livemode === false) {
          await archiveLinkedAccount(accountId);
          throw new Error('TEST connected accounts cannot be used on LIVE Traverion. Start LIVE onboarding again.');
        }
        latestStripeTransfersStatus = v2StripeTransfersStatus(v2);
      }
      const mirror = mirrorConnectAccount(account as Parameters<typeof mirrorConnectAccount>[0]);
      const mirrorWithMode = {
        ...mirror,
        connect_account_livemode:
          typeof (account as { livemode?: boolean }).livemode === 'boolean'
            ? Boolean((account as { livemode?: boolean }).livemode)
            : platformMode === 'live',
      };
      await persistMirror(mirrorWithMode);
      return { account, mirror: mirrorWithMode };
    }

    async function moneyMovementCounts(): Promise<{ transfers: number; bankPayouts: number }> {
      const [{ count: transfers }, { count: bankPayouts }] = await Promise.all([
        admin
          .from('supplier_transfer_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', supplierId),
        admin
          .from('supplier_bank_payout_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', supplierId),
      ]);
      return { transfers: transfers ?? 0, bankPayouts: bankPayouts ?? 0 };
    }

    async function archiveLinkedAccount(existingId: string): Promise<void> {
      const { error: archiveErr } = await admin
        .from('supplier_profiles')
        .update({
          connect_legacy_account_id: existingId,
          stripe_connected_account_id: null,
          connect_account_type: null,
          connect_account_livemode: false,
          connect_onboarding_status: 'not_started',
          connect_charges_enabled: false,
          connect_payouts_enabled: false,
          connect_details_submitted: false,
          connect_disabled_reason: 'archived_non_live_connect_account',
          connect_requirements_currently_due: [],
          connect_requirements_past_due: [],
          payout_rail: 'manual_iban',
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplierId);
      if (archiveErr) throw new Error(archiveErr.message);
      profile.stripe_connected_account_id = null;
      profile.connect_account_type = null;
      profile.connect_account_livemode = false;
      profile.connect_legacy_account_id = existingId;
      profile.connect_onboarding_status = 'not_started';
      profile.connect_charges_enabled = false;
      profile.connect_payouts_enabled = false;
    }

    /**
     * Idempotent: reuse Custom account; auto-archive TEST Express with no money movement
     * so Traverion-native forms are the default. Never touch LIVE or funded Express accounts.
     */
    async function ensureConnectedAccount(): Promise<{
      accountId: string;
      accountType: string;
      native_blocked_reason?: string | null;
      archived_legacy_account_id?: string | null;
    }> {
      let accountId = profile.stripe_connected_account_id as string | null;
      let archivedFrom: string | null = null;
      if (accountId) {
        const { account, mirror } = await syncAccount(accountId);
        const accountType = mirror.connect_account_type || (account.type as string) || 'unknown';
        if (accountType === 'custom') {
          return { accountId, accountType: 'custom' };
        }
        if (accountType === 'express') {
          // P8.5: Express uses Traverion-branded embedded Account Sessions.
          // Account.retrieve often omits `livemode`; on a LIVE platform treat Express as LIVE
          // unless Stripe explicitly marks livemode=false (TEST). Never archive LIVE Express.
          const accountLivemode = (account as { livemode?: boolean }).livemode;
          const treatAsLive =
            platformMode === 'live'
              ? accountLivemode !== false
              : accountLivemode === true;
          if (treatAsLive || platformMode === 'live') {
            return { accountId, accountType: 'express' };
          }
          const movement = await moneyMovementCounts();
          if (movement.transfers > 0 || movement.bankPayouts > 0) {
            return {
              accountId,
              accountType: 'express',
              native_blocked_reason:
                'This organization already has payout activity on the previous verification path. Contact Traverion support to continue.',
            };
          }
          // Safe TEST Express → archive, then create Accounts v2 below.
          archivedFrom = accountId;
          await archiveLinkedAccount(accountId);
          accountId = null;
        } else {
          return { accountId, accountType };
        }
      }

      if (accountId) {
        return { accountId, accountType: (profile.connect_account_type as string) || 'unknown' };
      }

      // P8.5: Never create a second LIVE connected account. Prefer restoring a prior LIVE Express link.
      const legacyId = (profile.connect_legacy_account_id as string | null) ?? null;
      if (platformMode === 'live' && legacyId) {
        try {
          const legacy = await stripe.accounts.retrieve(legacyId);
          if ((legacy as { livemode?: boolean }).livemode !== false) {
            const mirror = mirrorConnectAccount(legacy as Parameters<typeof mirrorConnectAccount>[0]);
            await admin
              .from('supplier_profiles')
              .update({
                ...mirror,
                connect_account_livemode: true,
                stripe_connected_account_id: legacyId,
                connect_legacy_account_id: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', supplierId);
            profile.stripe_connected_account_id = legacyId;
            profile.connect_account_type = mirror.connect_account_type || 'express';
            profile.connect_account_livemode = true;
            profile.connect_legacy_account_id = null;
            return {
              accountId: legacyId,
              accountType: mirror.connect_account_type || (legacy.type as string) || 'express',
            };
          }
        } catch {
          // Fall through only if legacy cannot be restored.
        }
      }
      if (platformMode === 'live' && legacyId) {
        throw new Error(
          'A LIVE connected account already exists for this supplier and must be restored by Traverion support — refusing to create a second LIVE account.'
        );
      }

      if (platformMode === 'live') {
        const createGate = await assertLiveCustomCreateAllowed(supplierId!);
        if (!createGate.allowed) {
          throw new Error(createGate.reason);
        }
        // P9.36: never create a LIVE Connect account without Traverion business approval.
        const businessStatus = String(profile.verification_status ?? '')
          .trim()
          .toLowerCase();
        if (businessStatus !== 'verified') {
          throw new Error(
            'Traverion business verification must be approved before LIVE payout account creation.'
          );
        }
        // Pilot approval (admin owner + Stripe ack) is required in addition to allowlist.
        const { data: pilotRow, error: pilotErr } = await admin
          .from('live_accounts_v2_pilot_approvals')
          .select('supplier_id')
          .eq('supplier_id', supplierId)
          .maybeSingle();
        if (pilotErr) {
          throw new Error('Could not verify LIVE pilot approval.');
        }
        if (!pilotRow?.supplier_id) {
          throw new Error(
            'LIVE pilot approval has not been recorded for this supplier. Ask Traverion to complete the pilot checklist first.'
          );
        }
      }

      const claim = await claimConnectCreate(supplierId!);
      if (claim.action === 'reuse' && claim.account_id) {
        profile.stripe_connected_account_id = claim.account_id;
        const reused = await syncAccount(claim.account_id);
        return {
          accountId: claim.account_id,
          accountType: reused.mirror.connect_account_type || (reused.account.type as string) || 'custom',
        };
      }
      if (claim.action === 'in_progress') {
        throw new Error('Payout account creation is already in progress. Wait a moment and continue.');
      }
      if (claim.action === 'refuse' && platformMode === 'live') {
        throw new Error('LIVE payout account creation is turned off.');
      }

      let created: { id: string; mirror: ReturnType<typeof mirrorConnectAccount> };
      try {
        created = await createAccountsV2Supplier({
          supplierId: supplierId!,
          email: authData.user.email ?? undefined,
          displayName: (profile.display_name || profile.company_legal_name || 'Traverion supplier') as string,
          entityType: profile.business_type === 'individual' ? 'individual' : 'company',
          countryRaw: ((profile.address_country || profile.connect_country || '') as string),
        });
      } catch (err) {
        await releaseConnectCreateClaim(supplierId!);
        throw err;
      }
      const { error: insertErr } = await admin
        .from('supplier_profiles')
        .update({
          ...created.mirror,
          payout_rail: 'manual_iban',
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplierId);
      if (insertErr) throw new Error(insertErr.message);
      profile.stripe_connected_account_id = created.id;
      profile.connect_account_type = 'custom';
      profile.connect_account_livemode = platformMode === 'live';
      return {
        accountId: created.id,
        accountType: 'custom' as const,
        archived_legacy_account_id:
          archivedFrom || ((profile.connect_legacy_account_id as string | null) ?? null),
      };
    }

    function statusPayload(
      mirror: ReturnType<typeof mirrorConnectAccount> | Record<string, unknown>,
      accountId: string | null,
      extras: Record<string, unknown> = {}
    ) {
      const accountType =
        (mirror as { connect_account_type?: string | null }).connect_account_type ??
        profile.connect_account_type ??
        null;
      const livemode =
        (mirror as { connect_account_livemode?: boolean | null }).connect_account_livemode ??
        (platformMode === 'live' ? true : platformMode === 'test' ? false : null);
      return {
        success: true as const,
        environment: platformMode,
        connect_account_livemode: livemode,
        can_receive_transfers: connectCanReceiveTransfers({
          ...(mirror as Parameters<typeof connectCanReceiveTransfers>[0]),
          require_live: platformMode === 'live',
          stripe_transfers_status: latestStripeTransfersStatus,
        }),
        verified: connectCanReceiveTransfers({
          ...(mirror as Parameters<typeof connectCanReceiveTransfers>[0]),
          require_live: platformMode === 'live',
          stripe_transfers_status: latestStripeTransfersStatus,
        }) === true,
        account_id: accountId,
        account_type: accountType,
        onboarding_mode: accountType === 'custom' ? 'api_native' : accountType === 'express' ? 'embedded' : 'unknown',
        onboarding: mirror,
        payout_schedule:
          profile.payment_cycle === 'biweekly'
            ? 'Twice monthly (Traverion cadence)'
            : 'Monthly (Traverion cadence)',
        note: 'Verification status comes from Account capabilities, not form submission alone. Verified requires LIVE capabilities when the platform is LIVE.',
        ...extras,
      };
    }

    async function statusExtras(): Promise<Record<string, unknown>> {
      const eligibility = await readLiveCreateEligibility(supplierId);
      const { data: gateRows } = await admin
        .from('commercial_runtime_config')
        .select('key, value_int')
        .in('key', ['payout_execution_enabled', 'stripe_connect_transfers_enabled']);
      const gateOn = (key: string) =>
        (gateRows ?? []).some((row) => row.key === key && row.value_int === 1);
      return {
        ...eligibility,
        payout_execution_enabled: gateOn('payout_execution_enabled'),
        connect_transfers_enabled: gateOn('stripe_connect_transfers_enabled'),
        payout_gates_open:
          gateOn('payout_execution_enabled') && gateOn('stripe_connect_transfers_enabled'),
        wizard_draft: sanitizeWizardDraft(
          (profile as { payout_wizard_draft?: unknown }).payout_wizard_draft
        ),
        wizard_draft_updated_at:
          (profile as { payout_wizard_draft_updated_at?: string | null })
            .payout_wizard_draft_updated_at ?? null,
      };
    }

    if (action === 'save_wizard_draft') {
      const cleaned = sanitizeWizardDraft(body.wizard_draft);
      const now = new Date().toISOString();
      const { error: draftErr } = await admin
        .from('supplier_profiles')
        .update({
          payout_wizard_draft: cleaned,
          payout_wizard_draft_updated_at: now,
          updated_at: now,
        })
        .eq('id', supplierId);
      if (draftErr) {
        return json({ success: false, error: draftErr.message }, 500);
      }
      (profile as { payout_wizard_draft?: unknown }).payout_wizard_draft = cleaned;
      (profile as { payout_wizard_draft_updated_at?: string | null }).payout_wizard_draft_updated_at =
        now;
      const extras = await statusExtras();
      if (profile.stripe_connected_account_id) {
        const { mirror } = await syncAccount(profile.stripe_connected_account_id);
        return json({
          action: 'save_wizard_draft',
          ...statusPayload(mirror, mirror.stripe_connected_account_id, extras),
        });
      }
      return json({
        action: 'save_wizard_draft',
        ...statusPayload(
          {
            connect_onboarding_status: 'not_started',
            connect_payouts_enabled: false,
            connect_charges_enabled: false,
            connect_details_submitted: false,
            connect_requirements_currently_due: [],
            connect_requirements_past_due: [],
            connect_account_type: null,
            payout_rail: profile.payout_rail ?? 'manual_iban',
          },
          null,
          extras
        ),
      });
    }

    if (action === 'status' || action === 'refresh') {
      const extras = await statusExtras();
      if (profile.stripe_connected_account_id) {
        const { mirror } = await syncAccount(profile.stripe_connected_account_id);
        return json({
          action,
          ...statusPayload(mirror, mirror.stripe_connected_account_id, extras),
        });
      }
      return json({
        action,
        ...statusPayload(
          {
            connect_onboarding_status: 'not_started',
            connect_payouts_enabled: false,
            connect_charges_enabled: false,
            connect_details_submitted: false,
            connect_requirements_currently_due: [],
            connect_requirements_past_due: [],
            connect_account_type: null,
            payout_rail: profile.payout_rail ?? 'manual_iban',
          },
          null,
          extras
        ),
      });
    }

    if (action === 'ensure_account' || action === 'start') {
      const ensured = await ensureConnectedAccount();
      const { mirror } = await syncAccount(ensured.accountId);
      return json({
        action: 'ensure_account',
        ...statusPayload(mirror, ensured.accountId, {
          created_or_reused: true,
          account_type: ensured.accountType,
          native_blocked_reason: ensured.native_blocked_reason ?? null,
          archived_legacy_account_id: ensured.archived_legacy_account_id ?? null,
          onboarding_mode:
            ensured.accountType === 'custom'
              ? 'api_native'
              : ensured.accountType === 'express'
                ? 'embedded'
                : 'unknown',
        }),
      });
    }

    /**
     * TEST-only: archive an Express (Stripe-collected) link and create a Custom account
     * so Traverion-native forms can run. Never deletes the Stripe Express object.
     * Blocked when transfer attempts exist for this supplier.
     */
    if (action === 'start_native_custom') {
      if (!body.confirm_archive_express) {
        return json({
          success: false,
          error: 'Confirm switching to Traverion verification forms before continuing.',
        }, 400);
      }

      const existingId = (profile.stripe_connected_account_id as string | null) ?? null;
      let archivedLegacyId: string | null =
        (profile.connect_legacy_account_id as string | null) ?? null;
      if (existingId) {
        const existing = await stripe.accounts.retrieve(existingId);
        if ((existing as { livemode?: boolean }).livemode) {
          return json({ success: false, error: 'Live connected accounts cannot be switched here.' }, 503);
        }
        const existingType = (existing.type || profile.connect_account_type || '').toLowerCase();
        if (existingType === 'custom') {
          const { mirror } = await syncAccount(existingId);
          return json({
            action: 'start_native_custom',
            ...statusPayload(mirror, existingId, {
              already_native: true,
              note: 'Custom account already linked — continue Traverion forms.',
            }),
          });
        }

        const { count: transferCount, error: transferErr } = await admin
          .from('supplier_transfer_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', supplierId);
        if (transferErr) throw new Error(transferErr.message);
        if ((transferCount ?? 0) > 0) {
          return json({
            success: false,
            error:
              'This organization already has transfer history. Keep the existing payout account or contact Traverion support.',
            transfer_attempts: transferCount,
          }, 409);
        }

        const { count: bankCount, error: bankErr } = await admin
          .from('supplier_bank_payout_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', supplierId);
        if (bankErr) throw new Error(bankErr.message);
        if ((bankCount ?? 0) > 0) {
          return json({
            success: false,
            error: 'This organization already has bank payout history. Contact Traverion support before switching.',
            bank_payout_attempts: bankCount,
          }, 409);
        }

        // Archive Express id; clear active link so ensureConnectedAccount creates Custom.
        const { error: archiveErr } = await admin
          .from('supplier_profiles')
          .update({
            connect_legacy_account_id: existingId,
            stripe_connected_account_id: null,
            connect_account_type: null,
            connect_onboarding_status: 'not_started',
            connect_charges_enabled: false,
            connect_payouts_enabled: false,
            connect_details_submitted: false,
            connect_disabled_reason: null,
            connect_requirements_currently_due: [],
            connect_requirements_past_due: [],
            payout_rail: 'manual_iban',
            updated_at: new Date().toISOString(),
          })
          .eq('id', supplierId);
        if (archiveErr) throw new Error(archiveErr.message);
        profile.stripe_connected_account_id = null;
        profile.connect_account_type = null;
        profile.connect_legacy_account_id = existingId;
        archivedLegacyId = existingId;
      }

      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType !== 'custom') {
        return json({
          success: false,
          error: 'Expected a Custom payout account for Traverion forms.',
          account_type: accountType,
        }, 500);
      }
      const { mirror } = await syncAccount(accountId);
      return json({
        action: 'start_native_custom',
        ...statusPayload(mirror, accountId, {
          archived_legacy_account_id: archivedLegacyId,
          note: archivedLegacyId
            ? 'Previous Express account archived. Continue with Traverion verification forms.'
            : 'Custom payout account ready. Continue with Traverion verification forms.',
        }),
      });
    }

    if (action === 'submit_business') {
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error:
            'This payout account uses the previous verification method. Continue with the secure in-app verification step, or contact Traverion to re-onboard in test.',
          account_type: 'express',
          onboarding_mode: 'embedded',
        }, 409);
      }
      const b = body.business ?? {};
      const country = (b.address?.country || profile.address_country || '').toString().trim().toUpperCase();
      const businessType = b.business_type || (profile.business_type === 'individual' ? 'individual' : 'company');
      if (accountType === 'custom') {
        const v2 = await nativeV2Account(accountId);
        if (v2) {
          if (finlandSupplierCountry(country) !== 'FI') {
            return json({
              success: false,
              error: country
                ? 'Accounts v2 onboarding is available for Finnish suppliers.'
                : 'Enter the country code FI before continuing payout setup.',
            }, 400);
          }
          const registeredName = b.legal_name || profile.company_legal_name || profile.display_name || undefined;
          const registration = (b.registration_number || b.tax_id || profile.company_registration_number || profile.tax_id || '').trim();
          if (businessType !== 'individual') {
            const digits = registration.replace(/\D/g, '');
            const normalized = digits.length === 8 ? `${digits.slice(0, 7)}-${digits.slice(7)}` : registration;
            const match = /^(\d{7})-(\d)$/.exec(normalized);
            const weights = [7, 9, 10, 5, 8, 4, 2];
            let validBusinessId = false;
            if (match) {
              let sum = 0;
              for (let i = 0; i < 7; i++) sum += Number(match[1][i]) * weights[i];
              const rem = sum % 11;
              const expected = rem === 0 ? 0 : rem === 1 ? -1 : 11 - rem;
              validBusinessId = expected >= 0 && Number(match[2]) === expected;
            }
            if (!validBusinessId) {
              return json({
                success: false,
                error: 'The Finnish Business ID on the company record needs to be corrected before it can be sent.',
              }, 400);
            }
          }
          await stripeV2('POST', `/v2/core/accounts/${accountId}`, {
            display_name: registeredName,
            contact_phone: b.phone || profile.contact_phone || undefined,
            defaults: {
              profile: {
                business_url: b.url || 'https://traverion.com',
                product_description: 'Travel experiences and stays sold on Traverion',
              },
            },
            identity: {
              country: 'fi',
              entity_type: businessType === 'individual' ? 'individual' : 'company',
              business_details: {
                registered_name: registeredName,
                phone: b.phone || profile.contact_phone || undefined,
                address: {
                  line1: b.address?.line1 || profile.address_street || undefined,
                  city: b.address?.city || profile.address_city || undefined,
                  postal_code: b.address?.postal_code || profile.address_postal_code || undefined,
                  country: 'fi',
                },
                ...(businessType !== 'individual' && registration
                  ? { id_numbers: [{ type: 'fi_yt', value: registration }] }
                  : {}),
              },
            },
            include: [...V2_RETRIEVE_INCLUDE],
          });
          await admin
            .from('supplier_profiles')
            .update({
              company_legal_name: b.legal_name?.trim() || profile.company_legal_name,
              business_type: businessType,
              contact_phone: b.phone?.trim() || profile.contact_phone,
              address_street: b.address?.line1?.trim() || profile.address_street,
              address_city: b.address?.city?.trim() || profile.address_city,
              address_postal_code: b.address?.postal_code?.trim() || profile.address_postal_code,
              address_country: country,
              company_registration_number: b.registration_number?.trim() || profile.company_registration_number,
              tax_id: b.tax_id?.trim() || profile.tax_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', supplierId);
          const { mirror } = await syncAccount(accountId);
          return json({ action, ...statusPayload(mirror, accountId) });
        }
      }
      const update: Stripe.AccountUpdateParams = {
        business_type: businessType,
        business_profile: {
          name: b.legal_name || profile.display_name || undefined,
          support_phone: b.phone || profile.contact_phone || undefined,
          url: b.url || undefined,
          mcc: '4722',
          product_description: 'Travel experiences and stays sold on Traverion',
        },
      };
      if (businessType === 'company') {
        update.company = {
          name: b.legal_name || profile.company_legal_name || undefined,
          phone: b.phone || profile.contact_phone || undefined,
          tax_id: b.tax_id || b.registration_number || profile.tax_id || profile.company_registration_number || undefined,
          address: {
            line1: b.address?.line1 || profile.address_street || undefined,
            line2: b.address?.line2 || undefined,
            city: b.address?.city || profile.address_city || undefined,
            postal_code: b.address?.postal_code || profile.address_postal_code || undefined,
            state: b.address?.state || undefined,
            country,
          },
        };
      } else {
        update.individual = {
          phone: b.phone || profile.contact_phone || undefined,
          address: {
            line1: b.address?.line1 || profile.address_street || undefined,
            line2: b.address?.line2 || undefined,
            city: b.address?.city || profile.address_city || undefined,
            postal_code: b.address?.postal_code || profile.address_postal_code || undefined,
            state: b.address?.state || undefined,
            country,
          },
        };
      }
      await stripe.accounts.update(accountId, update);
      // Keep Traverion company SoT in sync for non-sensitive fields.
      await admin
        .from('supplier_profiles')
        .update({
          company_legal_name: b.legal_name?.trim() || profile.company_legal_name,
          business_type: businessType,
          contact_phone: b.phone?.trim() || profile.contact_phone,
          address_street: b.address?.line1?.trim() || profile.address_street,
          address_city: b.address?.city?.trim() || profile.address_city,
          address_postal_code: b.address?.postal_code?.trim() || profile.address_postal_code,
          address_country: country,
          company_registration_number:
            b.registration_number?.trim() || profile.company_registration_number,
          tax_id: b.tax_id?.trim() || profile.tax_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplierId);
      const { mirror } = await syncAccount(accountId);
      return json({ action, ...statusPayload(mirror, accountId) });
    }

    if (action === 'submit_representative') {
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Representative updates for this account use the secure in-app verification step.',
          account_type: 'express',
        }, 409);
      }
      const r = body.representative ?? {};
      if (!r.first_name?.trim() || !r.last_name?.trim()) {
        return json({ success: false, error: 'First and last name are required' }, 400);
      }
      if (!r.dob?.day || !r.dob?.month || !r.dob?.year) {
        return json({ success: false, error: 'Date of birth is required' }, 400);
      }
      const year = Number(r.dob.year);
      const month = Number(r.dob.month);
      const day = Number(r.dob.day);
      const dobUtc = new Date(Date.UTC(year, month - 1, day));
      const dobValid =
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        year >= 1900 &&
        dobUtc.getUTCFullYear() === year &&
        dobUtc.getUTCMonth() === month - 1 &&
        dobUtc.getUTCDate() === day;
      if (!dobValid) {
        return json({ success: false, error: 'Enter a valid date of birth' }, 400);
      }
      const adultCutoff = new Date();
      adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
      if (dobUtc > adultCutoff) {
        return json({ success: false, error: 'The representative must be at least 18' }, 400);
      }
      if (r.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) {
        return json({ success: false, error: 'Enter a valid email address' }, 400);
      }
      const ownership = r.relationship?.percent_ownership;
      if (
        ownership != null &&
        (!Number.isFinite(Number(ownership)) || Number(ownership) < 0 || Number(ownership) > 100)
      ) {
        return json({ success: false, error: 'Ownership percent must be between 0 and 100' }, 400);
      }
      const country = (r.address?.country || profile.address_country || 'FI').toString().slice(0, 2).toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) {
        return json({ success: false, error: 'Enter a two-letter country code' }, 400);
      }
      const representativeV2 = await nativeV2Account(accountId);
      if (representativeV2) {
        const ownerDeclared = Boolean(r.relationship?.owner) && ownership != null && Number(ownership) > 0;
        const personId = await saveV2Person(
          accountId,
          v2PersonBody({
            first_name: r.first_name.trim(),
            last_name: r.last_name.trim(),
            email: r.email?.trim() || authData.user.email || undefined,
            phone: r.phone?.trim() || undefined,
            dob: { day, month, year },
            address: {
              line1: r.address?.line1 || profile.address_street || undefined,
              line2: r.address?.line2 || undefined,
              city: r.address?.city || profile.address_city || undefined,
              postal_code: r.address?.postal_code || profile.address_postal_code || undefined,
              state: r.address?.state || undefined,
              country,
            },
            relationship: {
              representative: true,
              executive: r.relationship?.executive !== false,
              director: Boolean(r.relationship?.director),
              owner: ownerDeclared,
              percent_ownership: ownership != null ? Number(ownership) : undefined,
              title: r.title?.trim() || 'Representative',
            },
          }),
          (person) => person.relationship?.representative === true,
          `rep:${supplierId}`
        );
        await stripeV2('POST', `/v2/core/accounts/${accountId}`, {
          identity: {
            attestations: {
              persons_provided: {
                directors: Boolean(r.relationship?.director),
                executives: r.relationship?.executive !== false,
                owners: ownerDeclared,
              },
            },
          },
          include: [...V2_RETRIEVE_INCLUDE],
        });
        const { mirror } = await syncAccount(accountId);
        return json({ action, person_id: personId, ...statusPayload(mirror, accountId) });
      }
      const persons = await stripe.accounts.listPersons(accountId, { limit: 20 });
      const existingRep = persons.data.find((p) => p.relationship?.representative);
      const personParams: Stripe.PersonCreateParams | Stripe.PersonUpdateParams = {
        first_name: r.first_name.trim(),
        last_name: r.last_name.trim(),
        email: r.email?.trim() || authData.user.email || undefined,
        phone: r.phone?.trim() || undefined,
        dob: {
          day: r.dob.day,
          month: r.dob.month,
          year: r.dob.year,
        },
        address: {
          line1: r.address?.line1 || profile.address_street || undefined,
          line2: r.address?.line2 || undefined,
          city: r.address?.city || profile.address_city || undefined,
          postal_code: r.address?.postal_code || profile.address_postal_code || undefined,
          state: r.address?.state || undefined,
          country,
        },
        relationship: {
          representative: true,
          executive: r.relationship?.executive !== false,
          director: Boolean(r.relationship?.director),
          owner: Boolean(r.relationship?.owner),
          percent_ownership:
            r.relationship?.percent_ownership != null
              ? Number(r.relationship.percent_ownership)
              : undefined,
          title: r.title?.trim() || 'Representative',
        },
      };
      let personId: string;
      if (existingRep) {
        const updated = await stripe.accounts.updatePerson(accountId, existingRep.id, personParams);
        personId = updated.id;
      } else {
        const created = await stripe.accounts.createPerson(accountId, personParams as Stripe.PersonCreateParams);
        personId = created.id;
      }
      // Mark ownership/structure declarations when the representative covers those roles.
      const ownerDeclared = Boolean(r.relationship?.owner) && ownership != null;
      if (profile.business_type !== 'individual') {
        const companyDeclarations: Stripe.AccountUpdateParams.Company = {
          executives_provided: r.relationship?.executive !== false,
        };
        if (Boolean(r.relationship?.director)) companyDeclarations.directors_provided = true;
        if (ownerDeclared) companyDeclarations.owners_provided = true;
        await stripe.accounts.update(accountId, { company: companyDeclarations });
      }
      const { mirror } = await syncAccount(accountId);
      return json({ action, person_id: personId, ...statusPayload(mirror, accountId) });
    }

    if (action === 'submit_beneficial_owners') {
      const owners = Array.isArray(body.owners) ? body.owners : [];
      if (owners.length === 0) {
        return json({ success: false, error: 'Add at least one beneficial owner, or skip this step.' }, 400);
      }
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Beneficial owners for this account are collected in the secure verification step.',
          account_type: 'express',
        }, 409);
      }
      const country =
        (profile.address_country || profile.connect_country || 'FI').toString().slice(0, 2).toUpperCase();
      const ownersAreV2 = Boolean(await nativeV2Account(accountId));
      const existing = ownersAreV2
        ? { data: [] as Stripe.Person[] }
        : await stripe.accounts.listPersons(accountId, { limit: 100 });
      const personIds: string[] = [];
      for (const o of owners) {
        const first = (o.first_name ?? '').trim();
        const last = (o.last_name ?? '').trim();
        if (!first || !last) {
          return json({ success: false, error: 'Each beneficial owner needs a first and last name.' }, 400);
        }
        const ownership =
          o.percent_ownership != null && Number.isFinite(Number(o.percent_ownership))
            ? Number(o.percent_ownership)
            : null;
        if (ownership == null || ownership < 0 || ownership > 100) {
          return json({
            success: false,
            error: 'Each beneficial owner needs an ownership percentage from 0 to 100.',
          }, 400);
        }
        const dob = o.dob;
        if (!dob?.day || !dob?.month || !dob?.year) {
          return json({ success: false, error: 'Each beneficial owner needs a date of birth.' }, 400);
        }
        if (ownersAreV2) {
          if (ownership <= 0) {
            return json({
              success: false,
              error: 'Each beneficial owner needs an ownership percentage above 0.',
            }, 400);
          }
          const personId = await saveV2Person(
            accountId,
            v2PersonBody({
              first_name: first,
              last_name: last,
              email: o.email?.trim() || undefined,
              dob: { day: dob.day, month: dob.month, year: dob.year },
              address: {
                line1: o.address?.line1 || profile.address_street || undefined,
                line2: o.address?.line2 || undefined,
                city: o.address?.city || profile.address_city || undefined,
                postal_code: o.address?.postal_code || profile.address_postal_code || undefined,
                state: o.address?.state || undefined,
                country: (o.address?.country || country).toString(),
              },
              relationship: {
                representative: false,
                director: false,
                executive: false,
                owner: true,
                percent_ownership: ownership,
                title: 'Owner',
              },
            }),
            (person) =>
              (person.given_name || '').trim().toLowerCase() === first.toLowerCase() &&
              (person.surname || '').trim().toLowerCase() === last.toLowerCase() &&
              person.relationship?.owner === true &&
              person.relationship?.representative !== true,
            `owner:${supplierId}:${first.toLowerCase()}:${last.toLowerCase()}`.slice(0, 200)
          );
          personIds.push(personId);
          continue;
        }
        const personParams: Stripe.PersonUpdateParams = {
          first_name: first,
          last_name: last,
          email: o.email?.trim() || undefined,
          dob: { day: dob.day, month: dob.month, year: dob.year },
          address: {
            line1: o.address?.line1 || profile.address_street || undefined,
            line2: o.address?.line2 || undefined,
            city: o.address?.city || profile.address_city || undefined,
            postal_code: o.address?.postal_code || profile.address_postal_code || undefined,
            state: o.address?.state || undefined,
            country: o.address?.country || country,
          },
          relationship: {
            owner: true,
            percent_ownership: ownership,
            representative: false,
            executive: false,
            director: false,
          },
        };
        const match = existing.data.find(
          (p) =>
            (p.first_name || '').trim().toLowerCase() === first.toLowerCase() &&
            (p.last_name || '').trim().toLowerCase() === last.toLowerCase() &&
            p.relationship?.owner === true &&
            p.relationship?.representative !== true
        );
        if (match) {
          const updated = await stripe.accounts.updatePerson(accountId, match.id, personParams);
          personIds.push(updated.id);
        } else {
          const created = await stripe.accounts.createPerson(
            accountId,
            personParams as Stripe.PersonCreateParams
          );
          personIds.push(created.id);
        }
      }
      if (ownersAreV2) {
        await stripeV2('POST', `/v2/core/accounts/${accountId}`, {
          identity: {
            attestations: {
              persons_provided: {
                owners: true,
              },
            },
          },
          include: [...V2_RETRIEVE_INCLUDE],
        });
      } else if (profile.business_type !== 'individual') {
        await stripe.accounts.update(accountId, { company: { owners_provided: true } });
      }
      const { mirror } = await syncAccount(accountId);
      return json({ action, person_ids: personIds, ...statusPayload(mirror, accountId) });
    }

    if (action === 'accept_tos') {
      if (body.tos_accepted !== true) {
        return json({ success: false, error: 'You must accept the Stripe Recipient Agreement to continue' }, 400);
      }
      if (body.agreement_version !== STRIPE_RECIPIENT_AGREEMENT.version) {
        return json({ success: false, error: 'Accept the current Stripe Recipient Agreement to continue' }, 400);
      }
      if (!ip || ip === '0.0.0.0') {
        return json({ success: false, error: 'A network address is required to record agreement acceptance.' }, 400);
      }
      const userAgent = (req.headers.get('user-agent') ?? '').trim().slice(0, 512);
      const acceptedAt = new Date().toISOString();
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Agreement acceptance for this account is collected in the secure verification step.',
          account_type: 'express',
        }, 409);
      }
      const { error: auditErr } = await admin.from('financial_audit_log').insert({
        actor_id: supplierId,
        action: 'supplier_recipient_agreement_accepted',
        supplier_id: supplierId,
        amount_minor: 0,
        currency: 'EUR',
        reason: 'Supplier accepted the Stripe Recipient Agreement before Stripe was updated.',
        provider_ref: accountId,
        after_state: {
          agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
          agreement_url: STRIPE_RECIPIENT_AGREEMENT.url,
          privacy_url: STRIPE_RECIPIENT_AGREEMENT.privacyUrl,
          accepted_at: acceptedAt,
          ip,
          user_agent: userAgent || null,
        },
      });
      if (auditErr) return json({ success: false, error: auditErr.message }, 500);
      const acceptance = {
        date: acceptedAt,
        ip,
        ...(userAgent ? { user_agent: userAgent } : {}),
      };
      const tosV2 = await nativeV2Account(accountId);
      try {
        if (tosV2) {
          await stripeV2('POST', `/v2/core/accounts/${accountId}`, {
            identity: {
              attestations: {
                terms_of_service: { account: acceptance },
              },
            },
            include: [...V2_RETRIEVE_INCLUDE],
          });
        } else {
          await stripe.accounts.update(accountId, {
            tos_acceptance: {
              date: Math.floor(Date.parse(acceptedAt) / 1000),
              ip,
              ...(userAgent ? { user_agent: userAgent } : {}),
            },
          });
        }
      } catch (stripeErr) {
        const message = stripeErr instanceof Error ? stripeErr.message : 'Stripe agreement update failed';
        await admin.from('financial_audit_log').insert({
          actor_id: supplierId,
          action: 'supplier_recipient_agreement_stripe_failed',
          supplier_id: supplierId,
          amount_minor: 0,
          currency: 'EUR',
          reason: 'Stripe did not record the recipient agreement. The supplier can submit the same acceptance again.',
          provider_ref: accountId,
          after_state: {
            agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
            accepted_at: acceptedAt,
            stripe_recorded: false,
            error: message.slice(0, 180),
          },
        });
        throw stripeErr;
      }
      const { error: recordedErr } = await admin.from('financial_audit_log').insert({
        actor_id: supplierId,
        action: 'supplier_recipient_agreement_stripe_recorded',
        supplier_id: supplierId,
        amount_minor: 0,
        currency: 'EUR',
        reason: 'Stripe accepted the recipient agreement update after the supplier consent was stored.',
        provider_ref: accountId,
        after_state: {
          agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
          accepted_at: acceptedAt,
          stripe_recorded: true,
        },
      });
      if (recordedErr) return json({ success: false, error: recordedErr.message }, 500);
      const { mirror } = await syncAccount(accountId);
      return json({ action, ...statusPayload(mirror, accountId) });
    }

    if (action === 'attach_bank_token') {
      const token = (body.bank_token ?? '').trim();
      if (!token.startsWith('btok_') && !token.startsWith('tok_')) {
        return json({ success: false, error: 'Invalid bank token' }, 400);
      }
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Bank details for this account are managed in the secure verification step.',
          account_type: 'express',
        }, 409);
      }
      await stripe.accounts.createExternalAccount(accountId, {
        external_account: token,
        default_for_currency: true,
      });
      const { mirror } = await syncAccount(accountId);
      return json({
        action,
        ...statusPayload(mirror, accountId, {
          bank_attached: true,
          note: 'Bank token attached. Payout readiness still depends on Account capabilities.',
        }),
      });
    }

    if (action === 'submit_identity_file') {
      const fileId = (body.identity?.file_id ?? '').trim();
      const personId = (body.identity?.person_id ?? '').trim();
      const side = body.identity?.side === 'back' ? 'back' : 'front';
      if (!fileId.startsWith('file_') || !personId) {
        return json({ success: false, error: 'Identity file and person are required' }, 400);
      }
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Identity documents for this account are collected in the secure verification step.',
          account_type: 'express',
        }, 409);
      }
      const identityV2 = await nativeV2Account(accountId);
      if (identityV2) {
        const sideKey = side === 'back' ? 'back' : 'front';
        await stripeV2('POST', `/v2/core/accounts/${accountId}/persons/${personId}`, {
          documents: {
            primary_verification: {
              type: 'front_back',
              front_back: { [sideKey]: fileId },
            },
          },
        });
      } else {
        await stripe.accounts.updatePerson(accountId, personId, {
          verification: {
            document: side === 'back' ? { back: fileId } : { front: fileId },
          },
        });
      }
      const { mirror } = await syncAccount(accountId);
      return json({ action, ...statusPayload(mirror, accountId) });
    }

    if (action === 'upload_identity_document') {
      const upload = body.identity_upload ?? {};
      const personId = (upload.person_id ?? '').trim();
      const side = upload.side === 'back' ? 'back' : 'front';
      const filename = (upload.filename ?? 'identity.jpg').trim().slice(0, 120) || 'identity.jpg';
      const contentType = (upload.content_type ?? '').trim().toLowerCase();
      const contentBase64 = (upload.content_base64 ?? '').replace(/\s+/g, '');
      if (!personId || !contentBase64) {
        return json({ success: false, error: 'Identity document and person are required' }, 400);
      }
      if (!['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(contentType)) {
        return json({
          success: false,
          error: 'Upload a JPEG, PNG, or PDF identity document.',
        }, 400);
      }
      // ~8MB decoded ceiling — refuse oversized payloads without writing to Traverion storage.
      if (contentBase64.length > 11_000_000) {
        return json({ success: false, error: 'Identity document is too large (max about 8 MB).' }, 400);
      }
      let bytes: Uint8Array;
      try {
        const bin = atob(contentBase64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } catch {
        return json({ success: false, error: 'Identity document could not be read.' }, 400);
      }
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Identity documents for this account are collected in the secure verification step.',
          account_type: 'express',
        }, 409);
      }
      const stripeFile = await stripe.files.create({
        purpose: 'identity_document',
        file: {
          data: bytes,
          name: filename,
          type: contentType === 'image/jpg' ? 'image/jpeg' : contentType,
        },
      });
      const uploadV2 = await nativeV2Account(accountId);
      if (uploadV2) {
        const sideKey = side === 'back' ? 'back' : 'front';
        await stripeV2('POST', `/v2/core/accounts/${accountId}/persons/${personId}`, {
          documents: {
            primary_verification: {
              type: 'front_back',
              front_back: { [sideKey]: stripeFile.id },
            },
          },
        });
      } else {
        await stripe.accounts.updatePerson(accountId, personId, {
          verification: {
            document: side === 'back' ? { back: stripeFile.id } : { front: stripeFile.id },
          },
        });
      }
      const { mirror } = await syncAccount(accountId);
      return json({
        action,
        file_id: stripeFile.id,
        person_id: personId,
        ...statusPayload(mirror, accountId),
      });
    }

    // Embedded Account Session — Express LIVE primary path (P8.5) + Custom remediation.
    if (action === 'account_session') {
      const ensured = await ensureConnectedAccount();
      const accountId = ensured.accountId;
      const component =
        body.component === 'account_management' ? 'account_management' : 'account_onboarding';

      // Prefill non-sensitive Traverion profile / wizard fields into Stripe where still writable (P9.49).
      // Never send ID documents or full bank numbers through this path — those stay in Stripe components.
      try {
        const country = (profile.address_country || profile.connect_country || 'FI')
          .toString()
          .slice(0, 2)
          .toUpperCase();
        const draftRaw = (profile as { payout_wizard_draft?: Record<string, unknown> | null })
          .payout_wizard_draft;
        const draft =
          draftRaw && typeof draftRaw === 'object' && !Array.isArray(draftRaw) ? draftRaw : {};
        const draftStr = (key: string) => {
          const v = draft[key];
          return typeof v === 'string' && v.trim() ? v.trim() : undefined;
        };
        const prefill: Stripe.AccountUpdateParams = {
          business_profile: {
            name: (profile.display_name || profile.company_legal_name || undefined) ?? undefined,
            support_email: authData.user.email ?? undefined,
            support_phone: profile.contact_phone || undefined,
            mcc: '4722',
            product_description: 'Travel experiences and stays sold on Traverion',
          },
          metadata: {
            traverion_supplier_id: supplierId!,
            traverion_environment: platformMode,
            traverion_onboarding: 'p949_embedded',
          },
        };
        if (profile.business_type === 'company' && profile.company_legal_name) {
          prefill.company = {
            name: profile.company_legal_name,
            phone: profile.contact_phone || undefined,
            tax_id: profile.tax_id || undefined,
            registration_number: profile.company_registration_number || undefined,
            address: {
              line1: profile.address_street || undefined,
              city: profile.address_city || undefined,
              postal_code: profile.address_postal_code || undefined,
              country,
            },
          };
        }
        if (profile.business_type === 'individual') {
          const first = draftStr('rep_first_name');
          const last = draftStr('rep_last_name');
          if (first || last) {
            prefill.individual = {
              first_name: first,
              last_name: last,
              email: draftStr('rep_email') || authData.user.email || undefined,
              phone: draftStr('rep_phone') || profile.contact_phone || undefined,
              address: {
                line1: profile.address_street || undefined,
                city: profile.address_city || undefined,
                postal_code: profile.address_postal_code || undefined,
                country,
              },
            };
          }
        }
        await stripe.accounts.update(accountId, prefill);
      } catch {
        // Express may reject KYC updates after Account Links exist — continue to session.
      }

      try {
        // P8.7: Express accounts with Stripe-collected requirements always require Stripe user
        // authentication for sensitive embedded steps. `disable_stripe_user_authentication` is only
        // valid when the platform collects requirements (Custom). Do not set it for Express —
        // Stripe rejects or ignores it and the secure login window remains required.
        const isCustom = ensured.accountType === 'custom';
        const sessionParams: Stripe.AccountSessionCreateParams = {
          account: accountId,
          components:
            component === 'account_management'
              ? {
                  account_management: {
                    enabled: true,
                    features: {
                      external_account_collection: true,
                      ...(isCustom ? { disable_stripe_user_authentication: true } : {}),
                    },
                  },
                }
              : {
                  account_onboarding: {
                    enabled: true,
                    features: {
                      external_account_collection: true,
                      ...(isCustom ? { disable_stripe_user_authentication: true } : {}),
                    },
                  },
                },
        };
        const session = await stripe.accountSessions.create(sessionParams);
        await syncAccount(accountId);
        return json({
          success: true,
          action: 'account_session',
          mode: 'embedded',
          environment: platformMode,
          account_id: accountId,
          account_type: ensured.accountType,
          client_secret: session.client_secret,
          publishable_key: publishableKey || null,
          component,
          expires_at: session.expires_at,
          note: 'Traverion-branded embedded Connect component. Secrets never leave the server session.',
        });
      } catch (sessionErr) {
        // Unavoidable fallback: Stripe-hosted Account Link for this step only.
        const link = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: 'account_onboarding',
        });
        return json({
          success: true,
          action: 'account_session',
          mode: 'hosted_fallback',
          environment: platformMode,
          account_id: accountId,
          account_type: ensured.accountType,
          url: link.url,
          expires_at: link.expires_at,
          fallback_reason: sessionErr instanceof Error ? sessionErr.message : 'account_session_unavailable',
          note: 'Embedded Account Session unavailable for this account; secure Stripe-hosted fallback for this step only.',
        });
      }
    }

    if (action === 'account_link') {
      const { accountId } = await ensureConnectedAccount();
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      return json({
        success: true,
        action: 'account_link',
        mode: 'hosted',
        environment: platformMode,
        account_id: accountId,
        url: link.url,
        expires_at: link.expires_at,
      });
    }

    return json({ success: false, error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
