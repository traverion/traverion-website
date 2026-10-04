/**
 * Traverion staff: admin API (JWT + app_metadata.role === 'admin').
 *
 * Enable verify_jwt in supabase/config.toml for this function.
 *
 * Grant admin: run supabase/manual/grant_traverion_admin.sql for your staff email.
 *
 * Secrets: SUPABASE_SERVICE_ROLE_KEY (auto).
 * Access: JWT must have app_metadata.role === 'admin' and email must match the single row in public.admin.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNED_URL_TTL = 3600;
const PARTNER_PORTAL = 'https://partner.traverion.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function verificationDecisionHtml(opts: {
  headline: string;
  sub: string;
  businessName: string;
  ctaLabel: string;
  ctaHref: string;
}): string {
  const logo = `${PARTNER_PORTAL}/traverionlogotransparent.png?v=3`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:system-ui,-apple-system,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:28px 28px 12px;text-align:center;background:#ffffff;">
<img src="${logo}" width="200" height="auto" alt="Traverion" style="display:block;margin:0 auto;max-width:85%;height:auto;border:0;"/>
</td></tr>
<tr><td style="padding:8px 32px 8px;font-size:20px;font-weight:700;color:#003580;font-family:Georgia,serif;">${escapeHtml(opts.headline)}</td></tr>
<tr><td style="padding:0 32px 16px;font-size:14px;line-height:1.5;color:#4b5563;">${escapeHtml(opts.sub)}</td></tr>
<tr><td style="padding:0 32px 24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5e7eb;padding-top:16px;">
<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">Business</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(opts.businessName)}</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 32px 32px;">
<a href="${escapeHtml(opts.ctaHref)}" style="display:inline-block;padding:12px 20px;background:#003580;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(opts.ctaLabel)}</a>
</td></tr>
</table>
<p style="font-size:12px;color:#9ca3af;margin-top:16px;">You are receiving this because you manage a supplier account on Traverion.</p>
<p style="font-size:12px;color:#9ca3af;"><a href="https://www.traverion.com" style="color:#003580;">traverion.com</a></p>
</td></tr></table></body></html>`;
}

async function resolveSupplierRecipientEmail(
  admin: ReturnType<typeof createClient>,
  supplierId: string
): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(supplierId);
  const email = data?.user?.email?.trim();
  return email || null;
}

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('SUPPLIER_EMAIL_FROM') ?? 'Traverion <no-reply@traverion.com>';
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  const resendJson = (await resendResp.json().catch(() => ({}))) as { message?: string; id?: string };
  if (!resendResp.ok) {
    return { ok: false, error: resendJson?.message ?? `Resend HTTP ${resendResp.status}` };
  }
  return { ok: true, id: resendJson?.id ?? null };
}

type Body = {
  action:
    | 'stats'
    | 'list'
    | 'list_verified'
    | 'detail'
    | 'approve_business'
    | 'reject_business'
    | 'approve_payout'
    | 'reject_payout'
    | 'list_portal_notifications'
    | 'create_portal_notification'
    | 'delete_portal_notification'
    | 'bookings_list'
    | 'finance_summary'
    | 'record_supplier_payout'
    | 'list_contact_inquiries'
    | 'update_contact_inquiry_status'
    | 'listings_moderation_list'
    | 'force_unpublish_listing'
    | 'content_reports_list'
    | 'resolve_content_report'
    | 'hide_review'
    | 'commercial_terms_get'
    | 'commercial_terms_set'
    | 'payout_periods_list'
    | 'prepare_due_payouts'
    | 'mark_payout_period_paid';
  supplierId?: string;
  feedback?: string | null;
  notificationTitle?: string;
  notificationBody?: string;
  notificationVariant?: string;
  notificationAudience?: string;
  supplierUserId?: string;
  notificationId?: string;
  bookingStatus?: string;
  bookingSearch?: string;
  bookingSupplierId?: string;
  inquiryId?: string;
  inquiryStatus?: string;
  payoutSupplierId?: string;
  payoutAmount?: number;
  payoutCurrency?: string;
  payoutPeriodStart?: string;
  payoutPeriodEnd?: string;
  payoutStatus?: string;
  payoutNote?: string | null;
  listingId?: string;
  listingSearch?: string;
  moderationReason?: string;
  reportId?: string;
  reportStatus?: string;
  reportResolutionNote?: string | null;
  reviewId?: string;
  hideReviewReason?: string;
  commercialPlanCode?: string;
  commercialCommissionBps?: number;
  commercialPayoutCadence?: string;
  commercialEffectiveFrom?: string;
  commercialNote?: string;
  commercialConfirm?: boolean;
  payoutPeriodId?: string;
};

function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return user?.app_metadata?.role === 'admin';
}

/** public.admin must contain exactly one row; JWT email must match it. */
async function assertSoleAdminRowEmail(
  adminClient: ReturnType<typeof createClient>,
  jwtEmail: string | null | undefined
): Promise<Response | null> {
  const e = jwtEmail?.trim().toLowerCase();
  if (!e) return json({ error: 'Forbidden' }, 403);
  const { data, error } = await adminClient.from('admin').select('email');
  if (error) {
    return json({ error: 'Admin configuration error' }, 500);
  }
  if (!data || data.length !== 1) {
    return json(
      { error: 'Admin API misconfigured: public.admin must contain exactly one row (see migration 037).' },
      503
    );
  }
  const row = data[0] as { email?: string | null };
  const allowed = row.email?.trim().toLowerCase();
  if (!allowed || allowed !== e) {
    return json({ error: 'Forbidden: email not allowed for admin API.' }, 403);
  }
  return null;
}

async function assertAdmin(
  req: Request,
  serviceKey: string,
  url: string
): Promise<{ admin: ReturnType<typeof createClient>; userId: string; email: string | null } | Response> {
  const authHeader = req.headers.get('Authorization')?.trim();
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Missing or invalid Authorization' }, 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return json({ error: 'Missing or invalid Authorization' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error } = await admin.auth.getUser(jwt);
  if (error || !userData.user) return json({ error: 'Unauthorized' }, 401);
  if (!isAdminUser(userData.user)) {
    return json({ error: 'Forbidden: Traverion admin role required (see grant_traverion_admin.sql).' }, 403);
  }
  // Phase 1125: admin email ownership requires a confirmed address (parity with jwt_verified_email).
  const verifiedEmail = authUserVerifiedEmail(userData.user);
  if (!verifiedEmail) {
    return json({ error: 'Forbidden: confirm your email before using the admin API.' }, 403);
  }
  const block = await assertSoleAdminRowEmail(admin, verifiedEmail);
  if (block) return block;
  return { admin, userId: userData.user.id, email: verifiedEmail };
}

async function signedUrlForPath(
  admin: ReturnType<typeof createClient>,
  path: string | null | undefined
): Promise<string | null> {
  const p = path?.trim();
  if (!p) return null;
  const { data, error } = await admin.storage.from('supplier-verification').createSignedUrl(p, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return json({ error: 'Missing Supabase env' }, 500);
  }

  const gate = await assertAdmin(req, serviceKey, url);
  if (gate instanceof Response) return gate;
  const { admin, userId: adminUserId, email: adminEmail } = gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const listSel =
    'id, display_name, company_legal_name, verification_status, verification_submitted_at, business_verification_feedback, payout_verification_status, payout_verification_submitted_at, payout_verification_feedback, created_at, updated_at';

  const detailSel =
    'id, display_name, contact_phone, company_legal_name, business_type, company_registration_number, managing_directors, business_address, address_street, address_country, address_city, address_postal_code, tax_id, vat_id, payout_iban, payout_bic, payout_method, payout_paypal_email, verification_status, verification_submitted_at, business_verification_feedback, payout_verification_status, payout_verification_submitted_at, payout_verification_feedback, identity_document_path, company_registration_document_path, business_logo_url, insurance_policy_number, insurance_coverage, insurance_start, insurance_end, insurance_provider, created_at, updated_at';

  if (body.action === 'stats') {
    const [
      suppliers,
      pendingBiz,
      pendingPay,
      listingsTotal,
      listingsPublished,
      customers,
    ] = await Promise.all([
      admin.from('supplier_profiles').select('*', { count: 'exact', head: true }),
      admin
        .from('supplier_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('verification_status', 'pending')
        .not('verification_submitted_at', 'is', null),
      admin
        .from('supplier_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('payout_verification_status', 'pending')
        .not('payout_verification_submitted_at', 'is', null),
      admin.from('listings').select('*', { count: 'exact', head: true }),
      admin.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      admin.from('consumer_profiles').select('*', { count: 'exact', head: true }),
    ]);

    const err =
      suppliers.error ||
      pendingBiz.error ||
      pendingPay.error ||
      listingsTotal.error ||
      listingsPublished.error ||
      customers.error;
    if (err) return json({ error: err.message }, 500);

    return json({
      total_suppliers: suppliers.count ?? 0,
      pending_business_submissions: pendingBiz.count ?? 0,
      pending_payout_submissions: pendingPay.count ?? 0,
      total_listings: listingsTotal.count ?? 0,
      published_listings: listingsPublished.count ?? 0,
      registered_customers: customers.count ?? 0,
    });
  }

  if (body.action === 'bookings_list') {
    const BOOKINGS_FETCH_CAP = 500;
    const statusFilter = typeof body.bookingStatus === 'string' ? body.bookingStatus.trim().toLowerCase() : 'all';
    const rawSearch = typeof body.bookingSearch === 'string' ? body.bookingSearch.trim() : '';
    const safeSearch = rawSearch.replace(/[,()%]/g, '').slice(0, 128);
    const supplierFilter = typeof body.bookingSupplierId === 'string' ? body.bookingSupplierId.trim() : '';

    let supplierListingIds: string[] | null = null;
    if (supplierFilter) {
      const { data: rows, error } = await admin.from('listings').select('id').eq('supplier_id', supplierFilter);
      if (error) return json({ error: error.message }, 500);
      supplierListingIds = (rows ?? []).map((r: any) => r.id as string);
      if (supplierListingIds.length === 0) {
        return json({ items: [], truncated: false, fetchedCount: 0 });
      }
    }

    const bookingCols =
      'id, listing_id, guest_email, guest_name, guests, booking_date, check_out, nights, purchase_snapshot, status, payment_status, amount_paid, currency, checkout_session_id, payment_intent_id, refund_choice, booking_number, created_at, hold_expires_at';

    let query = admin
      .from('bookings')
      .select(bookingCols)
      .order('created_at', { ascending: false })
      .limit(BOOKINGS_FETCH_CAP);
    if (statusFilter === 'pending' || statusFilter === 'confirmed' || statusFilter === 'cancelled') {
      query = query.eq('status', statusFilter);
    }
    if (supplierListingIds) {
      query = query.in('listing_id', supplierListingIds);
    }
    if (safeSearch) {
      // Phase 1053: guest / # / booking UUID / Stripe cs_ / pi_ (mirrors src/lib/admin-booking-search.ts).
      const orParts = [`guest_name.ilike.%${safeSearch}%`, `guest_email.ilike.%${safeSearch}%`];
      const asNumber = Number.parseInt(safeSearch, 10);
      if (Number.isFinite(asNumber) && asNumber > 0 && String(asNumber) === safeSearch) {
        orParts.push(`booking_number.eq.${asNumber}`);
      }
      const uuid = safeSearch.replace(/^\{|\}$/g, '');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
        orParts.push(`id.eq.${uuid}`);
      }
      const lower = safeSearch.toLowerCase();
      if (lower.startsWith('cs_')) {
        orParts.push(`checkout_session_id.eq.${safeSearch}`);
      } else if (lower.startsWith('pi_')) {
        orParts.push(`payment_intent_id.eq.${safeSearch}`);
      } else if (safeSearch.length >= 8) {
        orParts.push(`checkout_session_id.ilike.%${safeSearch}%`);
        orParts.push(`payment_intent_id.ilike.%${safeSearch}%`);
      }
      query = query.or(orParts.join(','));
    }

    const { data: bookingRows, error: bookingErr } = await query;
    if (bookingErr) return json({ error: bookingErr.message }, 500);
    const rows = (bookingRows ?? []) as any[];

    const listingIds = [...new Set(rows.map((r) => r.listing_id as string).filter(Boolean))];
    const { data: listingRows, error: listingErr } =
      listingIds.length > 0
        ? await admin.from('listings').select('id, title, supplier_id, city, country').in('id', listingIds)
        : { data: [] as any[], error: null };
    if (listingErr) return json({ error: listingErr.message }, 500);
    const listingById = new Map((listingRows ?? []).map((l: any) => [l.id as string, l]));

    const supplierIds = [
      ...new Set(Array.from(listingById.values()).map((l: any) => l.supplier_id as string).filter(Boolean)),
    ];
    const { data: supplierRows, error: supplierErr } =
      supplierIds.length > 0
        ? await admin.from('supplier_profiles').select('id, display_name, company_legal_name').in('id', supplierIds)
        : { data: [] as any[], error: null };
    if (supplierErr) return json({ error: supplierErr.message }, 500);
    const supplierById = new Map((supplierRows ?? []).map((s: any) => [s.id as string, s]));

    const items = rows.map((b) => {
      const listing = listingById.get(b.listing_id) as any;
      const supplier = listing ? (supplierById.get(listing.supplier_id) as any) : null;
      return {
        ...b,
        listing_title: listing?.title ?? null,
        listing_city: listing?.city ?? null,
        listing_country: listing?.country ?? null,
        supplier_id: listing?.supplier_id ?? null,
        supplier_name: (supplier?.company_legal_name || supplier?.display_name || null) as string | null,
      };
    });

    return json({ items, truncated: rows.length >= BOOKINGS_FETCH_CAP, fetchedCount: rows.length });
  }

  if (body.action === 'finance_summary') {
    const FETCH_CAP = 5000;
    const [bookingsRes, ledgerRes, earningsRes] = await Promise.all([
      admin.from('bookings').select('status, payment_status, amount_paid, currency, refund_choice').limit(FETCH_CAP),
      admin.from('supplier_ledger_entries').select('kind, amount, currency').limit(FETCH_CAP),
      admin.from('supplier_earnings').select('status, amount, currency').limit(FETCH_CAP),
    ]);
    if (bookingsRes.error) return json({ error: bookingsRes.error.message }, 500);
    if (ledgerRes.error) return json({ error: ledgerRes.error.message }, 500);
    if (earningsRes.error) return json({ error: earningsRes.error.message }, 500);

    const bookingRows = (bookingsRes.data ?? []) as any[];
    const ledgerRows = (ledgerRes.data ?? []) as any[];
    const earningsRows = (earningsRes.data ?? []) as any[];

    type Bucket = {
      collected: number;
      collectedCount: number;
      refundDue: number;
      refundDueCount: number;
      ledgerAdjustments: number;
      platformCommission: number;
      paidOut: number;
      pendingPayout: number;
    };
    const buckets = new Map<string, Bucket>();
    const bucketFor = (rawCurrency: string | null | undefined): Bucket => {
      const code = (rawCurrency ?? '').trim().toUpperCase() || 'EUR';
      let b = buckets.get(code);
      if (!b) {
        b = {
          collected: 0,
          collectedCount: 0,
          refundDue: 0,
          refundDueCount: 0,
          ledgerAdjustments: 0,
          platformCommission: 0,
          paidOut: 0,
          pendingPayout: 0,
        };
        buckets.set(code, b);
      }
      return b;
    };

    const normalizePaymentStatus = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toLowerCase() : '');
    const isPaidPaymentStatus = (raw: unknown): boolean => {
      const pay = normalizePaymentStatus(raw);
      return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
    };
    /**
     * Mirrors src/lib/payment-states.ts isCollectedBooking — keep in sync.
     * Phase 1728: late no_refund cancels stay collected (parity with Phase 1725 partner Money).
     */
    const isCollected = (b: any): boolean => {
      const status = normalizePaymentStatus(b.status);
      const pay = normalizePaymentStatus(b.payment_status);
      if (pay === 'refunded') return false;
      if (!isPaidPaymentStatus(b.payment_status)) return false;
      const amount = Number(b.amount_paid ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return false;
      if (status === 'cancelled') {
        return normalizePaymentStatus(b.refund_choice) === 'no_refund';
      }
      return true;
    };
    /** Mirrors src/lib/payment-states.ts isRefundDueBooking - keep in sync. */
    const isRefundDue = (b: any): boolean => {
      const cancelled = normalizePaymentStatus(b.status) === 'cancelled';
      const pay = normalizePaymentStatus(b.payment_status);
      if (!cancelled || pay === 'refunded' || !isPaidPaymentStatus(pay)) return false;
      const choice = normalizePaymentStatus(b.refund_choice);
      return choice !== 'no_refund';
    };
    /** Mirrors src/lib/supplier-ledger-balance.ts — keep in sync. */
    const isCollectedLedgerKind = (kind: unknown): boolean => {
      const k = normalizePaymentStatus(kind);
      return k === 'booking_earnings' || k === 'refund';
    };
    const isPlatformCommissionKind = (kind: unknown): boolean =>
      normalizePaymentStatus(kind) === 'platform_commission';

    for (const b of bookingRows) {
      const bucket = bucketFor(b.currency);
      if (isCollected(b)) {
        bucket.collected += Number(b.amount_paid ?? 0);
        bucket.collectedCount += 1;
      } else if (isRefundDue(b)) {
        bucket.refundDue += Number(b.amount_paid ?? 0);
        bucket.refundDueCount += 1;
      }
    }
    for (const row of ledgerRows) {
      if (isCollectedLedgerKind(row.kind)) continue; // supplier journal mirrors
      if (isPlatformCommissionKind(row.kind)) {
        bucketFor(row.currency).platformCommission += Number(row.amount ?? 0);
        continue;
      }
      bucketFor(row.currency).ledgerAdjustments += Number(row.amount ?? 0);
    }
    for (const row of earningsRows) {
      const status = normalizePaymentStatus(row.status);
      if (status === 'cancelled') continue;
      if (status === 'paid') bucketFor(row.currency).paidOut += Number(row.amount ?? 0);
      else if (status === 'pending') bucketFor(row.currency).pendingPayout += Number(row.amount ?? 0);
    }

    const byCurrency: Record<string, Bucket & { availableBalance: number }> = {};
    for (const [code, b] of buckets.entries()) {
      byCurrency[code] = { ...b, availableBalance: b.collected + b.ledgerAdjustments - b.paidOut };
    }

    return json({
      byCurrency,
      truncated:
        bookingRows.length >= FETCH_CAP || ledgerRows.length >= FETCH_CAP || earningsRows.length >= FETCH_CAP,
    });
  }

  if (body.action === 'record_supplier_payout') {
    const payoutSupplierId = typeof body.payoutSupplierId === 'string' ? body.payoutSupplierId.trim() : '';
    const payoutAmount = typeof body.payoutAmount === 'number' ? body.payoutAmount : NaN;
    const payoutCurrency = typeof body.payoutCurrency === 'string' ? body.payoutCurrency.trim() : '';
    const payoutPeriodStart = typeof body.payoutPeriodStart === 'string' ? body.payoutPeriodStart.trim() : '';
    const payoutPeriodEnd = typeof body.payoutPeriodEnd === 'string' ? body.payoutPeriodEnd.trim() : '';
    const payoutStatus = typeof body.payoutStatus === 'string' ? body.payoutStatus.trim().toLowerCase() : 'paid';
    const payoutNote = typeof body.payoutNote === 'string' && body.payoutNote.trim() ? body.payoutNote.trim() : null;

    if (!payoutSupplierId) return json({ error: 'payoutSupplierId required' }, 400);
    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return json({ error: 'payoutAmount must be a positive number' }, 400);
    }
    if (!payoutCurrency) return json({ error: 'payoutCurrency required' }, 400);
    if (!payoutPeriodStart || !payoutPeriodEnd) {
      return json({ error: 'payoutPeriodStart and payoutPeriodEnd required (YYYY-MM-DD)' }, 400);
    }
    if (payoutStatus !== 'pending' && payoutStatus !== 'paid') {
      return json({ error: "payoutStatus must be 'pending' or 'paid'" }, 400);
    }

    // Reuses record_paid_booking_earnings / reverse_paid_booking_earnings's exact
    // trust model: this RPC is granted only to service_role (see migration 094),
    // so it is reachable only through the assertAdmin() gate already enforced
    // above for this whole edge function -- never directly by a client.
    const { data: rpcData, error: rpcError } = await admin.rpc('admin_record_supplier_payout', {
      p_supplier_id: payoutSupplierId,
      p_amount: payoutAmount,
      p_currency: payoutCurrency,
      p_period_start: payoutPeriodStart,
      p_period_end: payoutPeriodEnd,
      p_status: payoutStatus,
      p_note: payoutNote,
      p_recorded_by: adminUserId,
    });
    if (rpcError) return json({ error: rpcError.message }, 500);
    const result = rpcData as { ok: boolean; error?: string; id?: string } | null;
    if (!result?.ok) return json({ error: result?.error ?? 'Could not record payout' }, 400);
    return json({ ok: true, id: result.id });
  }

  if (body.action === 'listings_moderation_list') {
    const q = typeof body.listingSearch === 'string' ? body.listingSearch.trim() : '';
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const byUuid = Boolean(q && uuidRe.test(q));

    let listingQuery = admin
      .from('listings')
      .select('id, title, status, style, experience_kind, city, country, supplier_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(80);

    // Default browse: published only. Exact UUID lookup includes drafts so staff can
    // confirm a force-unpublish already took effect or inspect an unpublished row.
    if (byUuid) {
      listingQuery = listingQuery.eq('id', q);
    } else {
      listingQuery = listingQuery.eq('status', 'published');
      if (q) {
        const safe = q.replace(/%/g, '').replace(/,/g, ' ').slice(0, 80);
        listingQuery = listingQuery.or(
          `title.ilike.%${safe}%,city.ilike.%${safe}%,country.ilike.%${safe}%`
        );
      }
    }

    const { data: listingRows, error: listingErr } = await listingQuery;
    if (listingErr) return json({ error: listingErr.message }, 500);

    const supplierIds = [
      ...new Set(
        (listingRows ?? [])
          .map((r: { supplier_id?: string | null }) => r.supplier_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const nameBySupplier = new Map<string, string>();
    if (supplierIds.length > 0) {
      const { data: profiles } = await admin
        .from('supplier_profiles')
        .select('id, display_name, company_legal_name')
        .in('id', supplierIds);
      for (const p of profiles ?? []) {
        const name =
          (typeof p.company_legal_name === 'string' && p.company_legal_name.trim()) ||
          (typeof p.display_name === 'string' && p.display_name.trim()) ||
          null;
        if (name) nameBySupplier.set(p.id, name);
      }
    }

    const items = (listingRows ?? []).map(
      (r: {
        id: string;
        title: string | null;
        status: string | null;
        style: string | null;
        experience_kind: string | null;
        city: string | null;
        country: string | null;
        supplier_id: string | null;
        updated_at: string | null;
      }) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        type: r.experience_kind || r.style || null,
        city: r.city,
        country: r.country,
        supplier_id: r.supplier_id,
        updated_at: r.updated_at,
        supplier_name: r.supplier_id ? nameBySupplier.get(r.supplier_id) ?? null : null,
      })
    );

    const { data: eventRows, error: eventErr } = await admin
      .from('admin_listing_moderation_events')
      .select(
        'id, listing_id, supplier_id, action, previous_status, new_status, reason, actor_email, upcoming_paid_bookings, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(40);
    if (eventErr) return json({ error: eventErr.message }, 500);

    const eventListingIds = [
      ...new Set((eventRows ?? []).map((e: { listing_id: string }) => e.listing_id)),
    ];
    const titleByListing = new Map<string, string>();
    if (eventListingIds.length > 0) {
      const { data: titles } = await admin.from('listings').select('id, title').in('id', eventListingIds);
      for (const t of titles ?? []) {
        if (typeof t.title === 'string' && t.title.trim()) titleByListing.set(t.id, t.title.trim());
      }
    }

    const events = (eventRows ?? []).map(
      (e: {
        id: string;
        listing_id: string;
        supplier_id: string | null;
        action: string;
        previous_status: string | null;
        new_status: string;
        reason: string;
        actor_email: string | null;
        upcoming_paid_bookings: number;
        created_at: string;
      }) => ({
        ...e,
        listing_title: titleByListing.get(e.listing_id) ?? null,
      })
    );

    return json({ items, events });
  }

  if (body.action === 'force_unpublish_listing') {
    const listingId = typeof body.listingId === 'string' ? body.listingId.trim() : '';
    const reason =
      typeof body.moderationReason === 'string' ? body.moderationReason.trim() : '';
    if (!listingId) return json({ error: 'listingId required' }, 400);
    if (reason.length < 3) return json({ error: 'moderationReason must be at least 3 characters' }, 400);

    const { data: rpcData, error: rpcError } = await admin.rpc('admin_force_unpublish_listing', {
      p_listing_id: listingId,
      p_reason: reason,
      p_actor_id: adminUserId,
      p_actor_email: adminEmail,
    });
    if (rpcError) return json({ error: rpcError.message }, 500);
    const result = rpcData as {
      ok: boolean;
      error?: string;
      skipped?: boolean;
      listing_id?: string;
      supplier_id?: string | null;
      title?: string | null;
      upcoming_paid_bookings?: number;
      new_status?: string;
      event_id?: string;
    } | null;
    if (!result?.ok) return json({ error: result?.error ?? 'Could not force-unpublish' }, 400);

    // Notify the supplier once when a published listing was actually taken down.
    if (!result.skipped && result.supplier_id) {
      const title = (result.title ?? 'Your listing').slice(0, 120);
      await admin.from('supplier_portal_notifications').insert({
        title: 'Listing unpublished by Traverion',
        body: `“${title}” was removed from traveler discovery by Traverion staff. Existing confirmed bookings stay valid. Contact support if you need clarification.`,
        variant: 'warning',
        audience: 'supplier',
        supplier_user_id: result.supplier_id,
      });
    }

    return json(result);
  }

  if (body.action === 'content_reports_list') {
    const { data: rows, error } = await admin
      .from('content_reports')
      .select(
        'id, reporter_user_id, target_type, target_id, reason, details, status, created_at, resolved_at, resolution_note'
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 500);

    const reviewIds = (rows ?? [])
      .filter((r: { target_type?: string }) => r.target_type === 'review')
      .map((r: { target_id: string }) => r.target_id);
    const reviewMeta = new Map<
      string,
      { listing_id: string | null; guest_name: string | null; rating: number | null; comment: string | null; hidden_at: string | null }
    >();
    if (reviewIds.length > 0) {
      const { data: reviews } = await admin
        .from('reviews')
        .select('id, listing_id, guest_name, rating, comment, hidden_at')
        .in('id', reviewIds);
      for (const rev of reviews ?? []) {
        reviewMeta.set(rev.id, {
          listing_id: rev.listing_id ?? null,
          guest_name: rev.guest_name ?? null,
          rating: typeof rev.rating === 'number' ? rev.rating : null,
          comment: typeof rev.comment === 'string' ? rev.comment.slice(0, 280) : null,
          hidden_at: rev.hidden_at ?? null,
        });
      }
    }

    const items = (rows ?? []).map(
      (r: {
        id: string;
        reporter_user_id: string;
        target_type: string;
        target_id: string;
        reason: string;
        details: string | null;
        status: string;
        created_at: string;
        resolved_at: string | null;
        resolution_note: string | null;
      }) => ({
        ...r,
        review: r.target_type === 'review' ? reviewMeta.get(r.target_id) ?? null : null,
      })
    );
    return json({ items });
  }

  if (body.action === 'resolve_content_report') {
    const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
    const status =
      typeof body.reportStatus === 'string' ? body.reportStatus.trim().toLowerCase() : '';
    const note =
      typeof body.reportResolutionNote === 'string' ? body.reportResolutionNote.trim() : '';
    if (!reportId) return json({ error: 'reportId required' }, 400);
    if (status !== 'resolved' && status !== 'dismissed' && status !== 'open') {
      return json({ error: "reportStatus must be 'open', 'resolved', or 'dismissed'" }, 400);
    }
    const patch: Record<string, unknown> = {
      status,
      resolved_at: status === 'open' ? null : new Date().toISOString(),
      resolved_by: status === 'open' ? null : adminUserId,
      resolution_note: note ? note.slice(0, 2000) : null,
    };
    const { error } = await admin.from('content_reports').update(patch).eq('id', reportId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === 'hide_review') {
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId.trim() : '';
    const reason =
      typeof body.hideReviewReason === 'string' ? body.hideReviewReason.trim() : '';
    if (!reviewId) return json({ error: 'reviewId required' }, 400);
    if (reason.length < 3) return json({ error: 'hideReviewReason must be at least 3 characters' }, 400);
    const { data: existing, error: findErr } = await admin
      .from('reviews')
      .select('id, hidden_at')
      .eq('id', reviewId)
      .maybeSingle();
    if (findErr) return json({ error: findErr.message }, 500);
    if (!existing) return json({ error: 'Review not found' }, 404);
    if (existing.hidden_at) return json({ ok: true, skipped: true });
    const { error } = await admin
      .from('reviews')
      .update({
        hidden_at: new Date().toISOString(),
        hidden_reason: reason.slice(0, 2000),
      })
      .eq('id', reviewId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, skipped: false });
  }

  if (body.action === 'commercial_terms_get') {
    const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : '';
    if (!supplierId) return json({ error: 'supplierId required' }, 400);
    const { data: current, error } = await admin
      .from('supplier_commercial_terms')
      .select(
        'id, supplier_id, plan_code, commission_bps, payout_cadence, effective_from, effective_until, status, note, created_at, created_by'
      )
      .eq('supplier_id', supplierId)
      .eq('status', 'active')
      .is('effective_until', null)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    const { data: history } = await admin
      .from('supplier_commercial_terms')
      .select(
        'id, plan_code, commission_bps, payout_cadence, effective_from, effective_until, status, note, created_at'
      )
      .eq('supplier_id', supplierId)
      .order('effective_from', { ascending: false })
      .limit(20);
    const { data: snaps } = await admin
      .from('booking_commercial_snapshots')
      .select(
        'booking_id, currency, remaining_gross_minor, remaining_commission_minor, remaining_supplier_minor, plan_code, commission_bps'
      )
      .eq('supplier_id', supplierId)
      .limit(500);
    let gmv = 0;
    let commission = 0;
    let supplierEarn = 0;
    for (const s of snaps ?? []) {
      gmv += Number(s.remaining_gross_minor ?? 0);
      commission += Number(s.remaining_commission_minor ?? 0);
      supplierEarn += Number(s.remaining_supplier_minor ?? 0);
    }
    const { data: items } = await admin
      .from('supplier_earning_items')
      .select('status, amount_minor, currency')
      .eq('supplier_id', supplierId);
    const byStatus: Record<string, number> = {};
    for (const it of items ?? []) {
      const k = String(it.status);
      byStatus[k] = (byStatus[k] ?? 0) + Number(it.amount_minor ?? 0);
    }
    return json({
      current,
      history: history ?? [],
      economicsMinor: { gmv, commission, supplierEarn },
      earningStatusMinor: byStatus,
    });
  }

  if (body.action === 'commercial_terms_set') {
    const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : '';
    const plan =
      typeof body.commercialPlanCode === 'string' ? body.commercialPlanCode.trim().toLowerCase() : '';
    const cadence =
      typeof body.commercialPayoutCadence === 'string'
        ? body.commercialPayoutCadence.trim().toLowerCase()
        : '';
    const bps = Number(body.commercialCommissionBps);
    const note = typeof body.commercialNote === 'string' ? body.commercialNote.trim() : '';
    const confirm = body.commercialConfirm === true;
    if (!supplierId) return json({ error: 'supplierId required' }, 400);
    if (!confirm) return json({ error: 'commercialConfirm must be true' }, 400);
    if (plan !== 'standard' && plan !== 'fast' && plan !== 'custom') {
      return json({ error: 'plan must be standard, fast, or custom' }, 400);
    }
    if (plan === 'custom') {
      if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
        return json({ error: 'custom plan requires commission bps 0–10000' }, 400);
      }
      if (cadence !== 'monthly' && cadence !== 'semimonthly') {
        return json({ error: 'custom plan requires payout cadence' }, 400);
      }
    }
    const resolvedBps = plan === 'standard' ? 1500 : plan === 'fast' ? 1800 : bps;
    const resolvedCadence =
      plan === 'standard' ? 'monthly' : plan === 'fast' ? 'semimonthly' : cadence;
    const effectiveFrom =
      typeof body.commercialEffectiveFrom === 'string' && body.commercialEffectiveFrom.trim()
        ? body.commercialEffectiveFrom.trim()
        : new Date().toISOString();
    const { data, error } = await admin.rpc('admin_set_supplier_commercial_terms', {
      p_supplier_id: supplierId,
      p_plan_code: plan,
      p_commission_bps: resolvedBps,
      p_payout_cadence: resolvedCadence,
      p_effective_from: effectiveFrom,
      p_note: note || null,
      p_actor_id: adminUserId,
    });
    if (error) return json({ error: error.message }, 500);
    const result = data as { ok?: boolean; error?: string; id?: string } | null;
    if (!result?.ok) return json({ error: result?.error ?? 'Could not set terms' }, 400);
    return json({ ok: true, id: result.id });
  }

  if (body.action === 'payout_periods_list') {
    const { data, error } = await admin
      .from('supplier_payout_periods')
      .select(
        'id, supplier_id, currency, cadence, period_key, period_start, period_end, scheduled_for, status, amount_minor, item_count, created_at, paid_at, note'
      )
      .order('scheduled_for', { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [] });
  }

  if (body.action === 'prepare_due_payouts') {
    const { data, error } = await admin.rpc('prepare_due_supplier_payouts', {
      p_now: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json(data ?? { ok: true });
  }

  if (body.action === 'mark_payout_period_paid') {
    const periodId = typeof body.payoutPeriodId === 'string' ? body.payoutPeriodId.trim() : '';
    if (!periodId) return json({ error: 'payoutPeriodId required' }, 400);
    const note = typeof body.payoutNote === 'string' ? body.payoutNote.trim() : '';
    const { data, error } = await admin.rpc('admin_mark_payout_period_paid', {
      p_period_id: periodId,
      p_note: note || null,
      p_actor_id: adminUserId,
    });
    if (error) return json({ error: error.message }, 500);
    const result = data as { ok?: boolean; error?: string } | null;
    if (!result?.ok) return json({ error: result?.error ?? 'Could not mark paid' }, 400);
    return json(result);
  }

  if (body.action === 'list_contact_inquiries') {
    const { data, error } = await admin
      .from('contact_inquiries')
      .select('id, name, email, phone, subject, message, inquiry_type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [] });
  }

  if (body.action === 'update_contact_inquiry_status') {
    const inquiryId = typeof body.inquiryId === 'string' ? body.inquiryId.trim() : '';
    const status = typeof body.inquiryStatus === 'string' ? body.inquiryStatus.trim().toLowerCase() : '';
    if (!inquiryId) return json({ error: 'inquiryId required' }, 400);
    if (status !== 'new' && status !== 'resolved') return json({ error: "inquiryStatus must be 'new' or 'resolved'" }, 400);
    const { error } = await admin.from('contact_inquiries').update({ status }).eq('id', inquiryId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === 'list') {
    const [bizRes, payRes] = await Promise.all([
      admin
        .from('supplier_profiles')
        .select(listSel)
        .eq('verification_status', 'pending')
        .not('verification_submitted_at', 'is', null),
      admin
        .from('supplier_profiles')
        .select(listSel)
        .eq('payout_verification_status', 'pending')
        .not('payout_verification_submitted_at', 'is', null),
    ]);

    if (bizRes.error) return json({ error: bizRes.error.message }, 500);
    if (payRes.error) return json({ error: payRes.error.message }, 500);

    const map = new Map<string, Record<string, unknown>>();
    for (const row of bizRes.data ?? []) map.set(row.id, { ...row });
    for (const row of payRes.data ?? []) {
      const prev = map.get(row.id);
      map.set(row.id, prev ? { ...prev, ...row } : { ...row });
    }
    const items = Array.from(map.values()).sort(
      (a, b) => new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime()
    );
    return json({ items });
  }

  if (body.action === 'list_verified') {
    const { data, error } = await admin
      .from('supplier_profiles')
      .select(listSel)
      .eq('verification_status', 'verified')
      .eq('payout_verification_status', 'verified')
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [] });
  }

  if (body.action === 'detail') {
    const supplierId = body.supplierId?.trim();
    if (!supplierId) return json({ error: 'supplierId required' }, 400);

    const { data: row, error } = await admin.from('supplier_profiles').select(detailSel).eq('id', supplierId).maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!row) return json({ error: 'Supplier not found' }, 404);

    const [identityUrl, companyRegUrl] = await Promise.all([
      signedUrlForPath(admin, row.identity_document_path),
      signedUrlForPath(admin, row.company_registration_document_path),
    ]);

    return json({
      profile: row,
      documents: {
        identity: row.identity_document_path
          ? { path: row.identity_document_path, signedUrl: identityUrl }
          : null,
        company_registration: row.company_registration_document_path
          ? { path: row.company_registration_document_path, signedUrl: companyRegUrl }
          : null,
      },
      signedUrlExpiresInSeconds: SIGNED_URL_TTL,
    });
  }

  if (body.action === 'list_portal_notifications') {
    const { data, error } = await admin
      .from('supplier_portal_notifications')
      .select('id, title, body, variant, audience, supplier_user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [] });
  }

  if (body.action === 'create_portal_notification') {
    const title = typeof body.notificationTitle === 'string' ? body.notificationTitle.trim() : '';
    const text = typeof body.notificationBody === 'string' ? body.notificationBody.trim() : '';
    const variantRaw =
      typeof body.notificationVariant === 'string' ? body.notificationVariant.trim().toLowerCase() : 'info';
    const variant = variantRaw === 'warning' || variantRaw === 'success' ? variantRaw : 'info';
    const audienceRaw =
      typeof body.notificationAudience === 'string' ? body.notificationAudience.trim().toLowerCase() : '';
    const audience = audienceRaw === 'supplier' ? 'supplier' : 'all';
    if (!title || !text) return json({ error: 'notificationTitle and notificationBody required' }, 400);
    if (title.length > 300) return json({ error: 'Title too long (max 300)' }, 400);
    if (text.length > 8000) return json({ error: 'Message too long (max 8000)' }, 400);

    let supplierUserId: string | null = null;
    if (audience === 'supplier') {
      const uid = typeof body.supplierUserId === 'string' ? body.supplierUserId.trim() : '';
      if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) {
        return json({ error: 'supplierUserId (UUID) required when audience is supplier' }, 400);
      }
      const { data: profile, error: pErr } = await admin.from('supplier_profiles').select('id').eq('id', uid).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!profile) return json({ error: 'No supplier profile for that user id' }, 404);
      supplierUserId = uid;
    }

    const { data: row, error } = await admin
      .from('supplier_portal_notifications')
      .insert({
        title,
        body: text,
        variant,
        audience,
        supplier_user_id: supplierUserId,
      })
      .select('id, title, body, variant, audience, supplier_user_id, created_at')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ item: row });
  }

  if (body.action === 'delete_portal_notification') {
    const id = typeof body.notificationId === 'string' ? body.notificationId.trim() : '';
    if (!id) return json({ error: 'notificationId required' }, 400);
    const { error } = await admin.from('supplier_portal_notifications').delete().eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const supplierId = body.supplierId?.trim();
  if (!supplierId) return json({ error: 'supplierId required' }, 400);

  if (body.action === 'approve_business') {
    const { data: before, error: beforeErr } = await admin
      .from('supplier_profiles')
      .select(
        'id, display_name, company_legal_name, verification_status, business_verified_email_sent_at, business_rejected_email_sent_at'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (beforeErr) return json({ error: beforeErr.message }, 500);
    if (!before) return json({ error: 'Supplier not found' }, 404);

    // Phase 1862: skip DB write when decision email already sent (do not clear sibling markers).
    const alreadyEmailed =
      before.verification_status === 'verified' && Boolean(before.business_verified_email_sent_at);
    if (alreadyEmailed) {
      return json({ ok: true, email: { sent: false, skipped: true, reason: 'already_sent' } });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        verification_status: 'verified',
        business_verification_feedback: null,
        business_rejected_email_sent_at: null,
        updated_at: now,
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);

    const to = await resolveSupplierRecipientEmail(admin, supplierId);
    if (!to) {
      console.error('[approve_business] no supplier email', supplierId);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: 'No supplier email on auth user' },
      });
    }

    const businessName =
      (typeof before.company_legal_name === 'string' && before.company_legal_name.trim()) ||
      (typeof before.display_name === 'string' && before.display_name.trim()) ||
      'your business';
    const subject = 'Your Traverion business is verified';
    const text = [
      `Good news — ${businessName} is verified on Traverion.`,
      '',
      'You can continue using partner features that require a verified business profile (including publishing listings once payout details are also verified).',
      '',
      `Open your partner portal: ${PARTNER_PORTAL}/partner`,
      '',
      '— Traverion',
    ].join('\n');
    const html = verificationDecisionHtml({
      headline: 'Your business is verified',
      sub: 'Traverion has approved your business profile. You can continue with partner features that require verification.',
      businessName,
      ctaLabel: 'Open partner portal',
      ctaHref: `${PARTNER_PORTAL}/partner`,
    });

    const sent = await sendResendEmail({ to, subject, text, html });
    if (!sent.ok) {
      console.error('[approve_business] email failed', supplierId, sent.error);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: sent.error },
      });
    }

    const { error: markErr } = await admin
      .from('supplier_profiles')
      .update({ business_verified_email_sent_at: now, updated_at: now })
      .eq('id', supplierId);
    if (markErr) {
      console.error('[approve_business] could not mark email sent', supplierId, markErr.message);
    }

    return json({
      ok: true,
      email: { sent: true, skipped: false, providerMessageId: sent.id, to },
    });
  }

  if (body.action === 'reject_business') {
    const fb = typeof body.feedback === 'string' ? body.feedback.trim() || null : null;
    const { data: before, error: beforeErr } = await admin
      .from('supplier_profiles')
      .select(
        'id, display_name, company_legal_name, verification_status, business_rejected_email_sent_at'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (beforeErr) return json({ error: beforeErr.message }, 500);
    if (!before) return json({ error: 'Supplier not found' }, 404);

    // Phase 1862: skip DB write when decision email already sent (preserve staff feedback).
    const alreadyEmailed =
      before.verification_status === 'rejected' && Boolean(before.business_rejected_email_sent_at);
    if (alreadyEmailed) {
      return json({ ok: true, email: { sent: false, skipped: true, reason: 'already_sent' } });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        verification_status: 'rejected',
        business_verification_feedback: fb,
        business_verified_email_sent_at: null,
        verification_submitted_email_sent_at: null,
        updated_at: now,
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);

    const to = await resolveSupplierRecipientEmail(admin, supplierId);
    if (!to) {
      console.error('[reject_business] no supplier email', supplierId);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: 'No supplier email on auth user' },
      });
    }

    const businessName =
      (typeof before.company_legal_name === 'string' && before.company_legal_name.trim()) ||
      (typeof before.display_name === 'string' && before.display_name.trim()) ||
      'your business';
    const feedbackLine = fb
      ? `Traverion note: ${fb}`
      : 'Please review your business details and registration document in Settings, then submit again.';
    const subject = 'Update needed for your Traverion business verification';
    const text = [
      `Traverion could not verify ${businessName} yet.`,
      '',
      feedbackLine,
      '',
      `Update your profile: ${PARTNER_PORTAL}/partner/settings`,
      '',
      '— Traverion',
    ].join('\n');
    const html = verificationDecisionHtml({
      headline: 'Verification needs an update',
      sub: feedbackLine,
      businessName,
      ctaLabel: 'Review business settings',
      ctaHref: `${PARTNER_PORTAL}/partner/settings`,
    });

    const sent = await sendResendEmail({ to, subject, text, html });
    if (!sent.ok) {
      console.error('[reject_business] email failed', supplierId, sent.error);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: sent.error },
      });
    }

    const { error: markErr } = await admin
      .from('supplier_profiles')
      .update({ business_rejected_email_sent_at: now, updated_at: now })
      .eq('id', supplierId);
    if (markErr) {
      console.error('[reject_business] could not mark email sent', supplierId, markErr.message);
    }

    return json({
      ok: true,
      email: { sent: true, skipped: false, providerMessageId: sent.id, to },
    });
  }

  if (body.action === 'approve_payout') {
    const { data: before, error: beforeErr } = await admin
      .from('supplier_profiles')
      .select(
        'id, display_name, company_legal_name, payout_verification_status, payout_verified_email_sent_at'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (beforeErr) return json({ error: beforeErr.message }, 500);
    if (!before) return json({ error: 'Supplier not found' }, 404);

    // Phase 1862: skip DB write when decision email already sent.
    const alreadyEmailed =
      before.payout_verification_status === 'verified' && Boolean(before.payout_verified_email_sent_at);
    if (alreadyEmailed) {
      return json({ ok: true, email: { sent: false, skipped: true, reason: 'already_sent' } });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        payout_verification_status: 'verified',
        payout_verification_feedback: null,
        payout_rejected_email_sent_at: null,
        updated_at: now,
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);

    const to = await resolveSupplierRecipientEmail(admin, supplierId);
    if (!to) {
      console.error('[approve_payout] no supplier email', supplierId);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: 'No supplier email on auth user' },
      });
    }

    const businessName =
      (typeof before.company_legal_name === 'string' && before.company_legal_name.trim()) ||
      (typeof before.display_name === 'string' && before.display_name.trim()) ||
      'your business';
    const subject = 'Your Traverion payout details are verified';
    const text = [
      `Good news — the bank details on file for ${businessName} are verified on Traverion.`,
      '',
      'If your business profile is also verified, you can publish listings and receive payouts for paid bookings.',
      '',
      `Open your partner portal: ${PARTNER_PORTAL}/partner`,
      '',
      '— Traverion',
    ].join('\n');
    const html = verificationDecisionHtml({
      headline: 'Your payout details are verified',
      sub: 'Traverion has approved the bank details (IBAN/BIC) on file for your account.',
      businessName,
      ctaLabel: 'Open partner portal',
      ctaHref: `${PARTNER_PORTAL}/partner`,
    });

    const sent = await sendResendEmail({ to, subject, text, html });
    if (!sent.ok) {
      console.error('[approve_payout] email failed', supplierId, sent.error);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: sent.error },
      });
    }

    const { error: markErr } = await admin
      .from('supplier_profiles')
      .update({ payout_verified_email_sent_at: now, updated_at: now })
      .eq('id', supplierId);
    if (markErr) {
      console.error('[approve_payout] could not mark email sent', supplierId, markErr.message);
    }

    return json({
      ok: true,
      email: { sent: true, skipped: false, providerMessageId: sent.id, to },
    });
  }

  if (body.action === 'reject_payout') {
    const fb = typeof body.feedback === 'string' ? body.feedback.trim() || null : null;
    const { data: before, error: beforeErr } = await admin
      .from('supplier_profiles')
      .select(
        'id, display_name, company_legal_name, payout_verification_status, payout_rejected_email_sent_at'
      )
      .eq('id', supplierId)
      .maybeSingle();
    if (beforeErr) return json({ error: beforeErr.message }, 500);
    if (!before) return json({ error: 'Supplier not found' }, 404);

    // Phase 1862: skip DB write when decision email already sent (preserve staff feedback).
    const alreadyEmailed =
      before.payout_verification_status === 'rejected' && Boolean(before.payout_rejected_email_sent_at);
    if (alreadyEmailed) {
      return json({ ok: true, email: { sent: false, skipped: true, reason: 'already_sent' } });
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        payout_verification_status: 'rejected',
        payout_verification_feedback: fb,
        payout_verified_email_sent_at: null,
        updated_at: now,
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);

    const to = await resolveSupplierRecipientEmail(admin, supplierId);
    if (!to) {
      console.error('[reject_payout] no supplier email', supplierId);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: 'No supplier email on auth user' },
      });
    }

    const businessName =
      (typeof before.company_legal_name === 'string' && before.company_legal_name.trim()) ||
      (typeof before.display_name === 'string' && before.display_name.trim()) ||
      'your business';
    const feedbackLine = fb
      ? `Traverion note: ${fb}`
      : 'Please review your bank details (IBAN/BIC) in Settings, then submit again.';
    const subject = 'Update needed for your Traverion payout details';
    const text = [
      `Traverion could not verify the payout (bank) details on file for ${businessName} yet.`,
      '',
      feedbackLine,
      '',
      `Update your bank details: ${PARTNER_PORTAL}/partner/settings`,
      '',
      '— Traverion',
    ].join('\n');
    const html = verificationDecisionHtml({
      headline: 'Payout details need an update',
      sub: feedbackLine,
      businessName,
      ctaLabel: 'Review payout settings',
      ctaHref: `${PARTNER_PORTAL}/partner/settings`,
    });

    const sent = await sendResendEmail({ to, subject, text, html });
    if (!sent.ok) {
      console.error('[reject_payout] email failed', supplierId, sent.error);
      return json({
        ok: true,
        email: { sent: false, skipped: false, error: sent.error },
      });
    }

    const { error: markErr } = await admin
      .from('supplier_profiles')
      .update({ payout_rejected_email_sent_at: now, updated_at: now })
      .eq('id', supplierId);
    if (markErr) {
      console.error('[reject_payout] could not mark email sent', supplierId, markErr.message);
    }

    return json({
      ok: true,
      email: { sent: true, skipped: false, providerMessageId: sent.id, to },
    });
  }

  return json({ error: 'Unknown action' }, 400);
});
