/**
 * Stripe Connect onboarding for Traverion suppliers (TEST only).
 *
 * Preferred (new accounts): Custom connected accounts + API updates from
 * Traverion-native forms (no Express login popup / hosted Account Link).
 *
 * Legacy Express accounts: Account Session embedded components (or hosted
 * Account Link fallback). Never silently recreate Express → Custom.
 *
 * Verification status always comes from Account sync / webhooks — never from
 * form submission alone.
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
    | 'accept_tos'
    | 'attach_bank_token'
    | 'submit_identity_file';
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
  bank_token?: string;
  identity?: {
    person_id?: string;
    file_id?: string;
    side?: 'front' | 'back';
  };
  tos_accepted?: boolean;
};

function allowlistedOrigin(raw: string | undefined, publicSite: string, extras: string[]): string {
  const candidates = [publicSite, ...extras]
    .map((s) => s.replace(/\/$/, ''))
    .filter(Boolean);
  const origin = (raw ?? '').trim().replace(/\/$/, '');
  if (origin && candidates.some((c) => c === origin)) return origin;
  return candidates[0] || 'https://partner.traverion.com';
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
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const publishableKey = (Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '').trim();
    const publicSiteUrl = (
      Deno.env.get('PARTNER_SITE_URL') ??
      Deno.env.get('PUBLIC_SITE_URL') ??
      'https://partner.traverion.com'
    ).replace(/\/$/, '');
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
    if (publishableKey && !publishableKey.startsWith('pk_test_')) {
      return json({ success: false, error: 'Publishable key must be test mode for payout verification' }, 503);
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
    const action = (body.action ?? 'status') as NonNullable<Body['action']>;

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
        'id, display_name, company_legal_name, business_type, address_street, address_city, address_postal_code, address_country, contact_phone, company_registration_number, tax_id, stripe_connected_account_id, connect_account_type, connect_legacy_account_id, connect_onboarding_status, connect_charges_enabled, connect_payouts_enabled, connect_details_submitted, connect_disabled_reason, connect_requirements_currently_due, connect_requirements_past_due, connect_default_currency, connect_country, connect_debit_negative_balances, connect_last_synced_at, payout_rail, payment_cycle'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (profileErr || !profile) {
      return json({ success: false, error: profileErr?.message ?? 'Supplier profile not found' }, 404);
    }

    const origin = allowlistedOrigin(body.returnOrigin, publicSiteUrl, extraOrigins);
    const returnUrl = `${origin}/partner/money?tab=settings&connect=return`;
    const refreshUrl = `${origin}/partner/money?tab=settings&connect=refresh`;
    const ip = clientIp(req);

    async function persistMirror(mirror: ReturnType<typeof mirrorConnectAccount>) {
      const { error: updErr } = await admin
        .from('supplier_profiles')
        .update({ ...mirror, updated_at: new Date().toISOString() })
        .eq('id', supplierId);
      if (updErr) throw new Error(updErr.message);
    }

    async function syncAccount(accountId: string) {
      const account = await stripe.accounts.retrieve(accountId);
      // Ownership: only allow accounts tagged to this supplier (or legacy untagged during TEST).
      const metaSupplier = (account.metadata?.traverion_supplier_id ?? '').trim();
      if (metaSupplier && metaSupplier !== supplierId) {
        throw new Error('Connected account does not belong to this supplier organization');
      }
      const mirror = mirrorConnectAccount(account as Parameters<typeof mirrorConnectAccount>[0]);
      await persistMirror(mirror);
      return { account, mirror };
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
          if ((account as { livemode?: boolean }).livemode) {
            return {
              accountId,
              accountType: 'express',
              native_blocked_reason:
                'This payout account cannot use Traverion forms automatically. Contact Traverion support.',
            };
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
          // Safe TEST Express → archive, then create Custom below.
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

      const country = (profile.address_country || profile.connect_country || 'FI')
        .toString()
        .slice(0, 2)
        .toUpperCase();
      const email = authData.user.email ?? undefined;
      const isIndividual = profile.business_type === 'individual';
      const createParams: Stripe.AccountCreateParams = {
        type: 'custom',
        country,
        email,
        business_type: isIndividual ? 'individual' : 'company',
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          traverion_supplier_id: supplierId!,
          traverion_environment: 'test',
          traverion_onboarding: 'api_native',
        },
        settings: {
          payouts: {
            schedule: { interval: 'daily' },
          },
        },
        business_profile: {
          name: (profile.display_name || profile.company_legal_name || undefined) ?? undefined,
          product_description: 'Travel experiences and stays sold on Traverion',
          mcc: '4722',
          support_email: email,
          support_phone: profile.contact_phone || undefined,
        },
      };

      if (!isIndividual && profile.company_legal_name) {
        createParams.company = {
          name: profile.company_legal_name,
          phone: profile.contact_phone || undefined,
          tax_id: profile.tax_id || profile.company_registration_number || undefined,
          address: {
            line1: profile.address_street || undefined,
            city: profile.address_city || undefined,
            postal_code: profile.address_postal_code || undefined,
            country,
          },
        };
      }

      if (isIndividual) {
        createParams.individual = {
          email,
          phone: profile.contact_phone || undefined,
          address: {
            line1: profile.address_street || undefined,
            city: profile.address_city || undefined,
            postal_code: profile.address_postal_code || undefined,
            country,
          },
        };
      }

      const created = await stripe.accounts.create(createParams);
      accountId = created.id;
      const mirror = mirrorConnectAccount(created as Parameters<typeof mirrorConnectAccount>[0]);
      const { error: insertErr } = await admin
        .from('supplier_profiles')
        .update({
          ...mirror,
          payout_rail: 'manual_iban',
          updated_at: new Date().toISOString(),
        })
        .eq('id', supplierId);
      if (insertErr) throw new Error(insertErr.message);
      // Refresh local profile pointer for subsequent actions in this request.
      profile.stripe_connected_account_id = accountId;
      profile.connect_account_type = 'custom';
      return {
        accountId,
        accountType: 'custom',
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
      return {
        success: true as const,
        environment: 'test' as const,
        can_receive_transfers: connectCanReceiveTransfers(
          mirror as Parameters<typeof connectCanReceiveTransfers>[0]
        ),
        account_id: accountId,
        account_type: accountType,
        onboarding_mode: accountType === 'custom' ? 'api_native' : accountType === 'express' ? 'embedded' : 'unknown',
        onboarding: mirror,
        payout_schedule:
          profile.payment_cycle === 'biweekly'
            ? 'Twice monthly (Traverion cadence)'
            : 'Monthly (Traverion cadence)',
        note: 'Verification status comes from Account capabilities, not form submission alone.',
        ...extras,
      };
    }

    if (action === 'status' || action === 'refresh') {
      if (profile.stripe_connected_account_id) {
        const { mirror } = await syncAccount(profile.stripe_connected_account_id);
        return json({ action, ...statusPayload(mirror, mirror.stripe_connected_account_id) });
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
          null
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
          onboarding_mode: ensured.accountType === 'custom' ? 'api_native' : 'legacy_protected',
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
      const country = (b.address?.country || profile.address_country || 'FI').toString().slice(0, 2).toUpperCase();
      const businessType = b.business_type || (profile.business_type === 'individual' ? 'individual' : 'company');
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
      const country = (r.address?.country || profile.address_country || 'FI').toString().slice(0, 2).toUpperCase();
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
      await stripe.accounts.update(accountId, {
        company: {
          directors_provided: true,
          executives_provided: true,
          owners_provided: true,
        },
      });
      const { mirror } = await syncAccount(accountId);
      return json({ action, person_id: personId, ...statusPayload(mirror, accountId) });
    }

    if (action === 'accept_tos') {
      if (!body.tos_accepted) {
        return json({ success: false, error: 'You must accept the Connected Account Agreement to continue' }, 400);
      }
      const { accountId, accountType } = await ensureConnectedAccount();
      if (accountType === 'express') {
        return json({
          success: false,
          error: 'Agreement acceptance for this account is collected in the secure verification step.',
          account_type: 'express',
        }, 409);
      }
      await stripe.accounts.update(accountId, {
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip,
        },
      });
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
      await stripe.accounts.updatePerson(accountId, personId, {
        verification: {
          document: side === 'back' ? { back: fileId } : { front: fileId },
        },
      });
      const { mirror } = await syncAccount(accountId);
      return json({ action, ...statusPayload(mirror, accountId) });
    }

    // Embedded Account Session — used for Express legacy + risk remediation exceptions.
    if (action === 'account_session') {
      const { accountId } = await ensureConnectedAccount();
      const component =
        body.component === 'account_management' ? 'account_management' : 'account_onboarding';

      try {
        const sessionParams: Stripe.AccountSessionCreateParams = {
          account: accountId,
          components:
            component === 'account_management'
              ? {
                  account_management: {
                    enabled: true,
                    features: {
                      external_account_collection: true,
                    },
                  },
                }
              : {
                  account_onboarding: {
                    enabled: true,
                    features: {
                      external_account_collection: true,
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
          environment: 'test',
          account_id: accountId,
          client_secret: session.client_secret,
          publishable_key: publishableKey || null,
          component,
          expires_at: session.expires_at,
          note: 'Embedded component reserved for legacy Express accounts or provider-controlled remediation.',
        });
      } catch (sessionErr) {
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
          environment: 'test',
          account_id: accountId,
          url: link.url,
          expires_at: link.expires_at,
          fallback_reason: sessionErr instanceof Error ? sessionErr.message : 'account_session_unavailable',
          note: 'Embedded Account Session unavailable; hosted Account Link fallback (legacy path).',
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
        environment: 'test',
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
