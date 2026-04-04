/**
 * Traverion staff: admin API (JWT + app_metadata.role === 'admin').
 *
 * Enable verify_jwt in supabase/config.toml for this function.
 *
 * Grant admin: run supabase/manual/grant_traverion_admin.sql for your staff email.
 *
 * Secrets: SUPABASE_SERVICE_ROLE_KEY (auto).
 * Required: TRAVERION_ADMIN_EMAILS — comma-separated lowercase staff emails. JWT user must be role admin and
 * on this list, or every action returns 403/503.
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNED_URL_TTL = 3600;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type Body = {
  action:
    | 'stats'
    | 'list'
    | 'detail'
    | 'approve_business'
    | 'reject_business'
    | 'approve_payout'
    | 'reject_payout';
  supplierId?: string;
  feedback?: string | null;
};

function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return user?.app_metadata?.role === 'admin';
}

/** Non-empty allowlist from secret; otherwise callers cannot use the API (misconfiguration). */
function requiredAdminEmailAllowlist(): Set<string> | Response {
  const raw = Deno.env.get('TRAVERION_ADMIN_EMAILS')?.trim();
  if (!raw) {
    return json(
      {
        error:
          'Admin API disabled: set Supabase secret TRAVERION_ADMIN_EMAILS (comma-separated staff emails, same as VITE_TRAVERION_ADMIN_EMAILS).',
      },
      503
    );
  }
  const allow = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  if (allow.size === 0) {
    return json(
      { error: 'Admin API disabled: TRAVERION_ADMIN_EMAILS must list at least one email.' },
      503
    );
  }
  return allow;
}

async function assertAdmin(
  req: Request,
  serviceKey: string,
  url: string
): Promise<{ admin: ReturnType<typeof createClient>; userId: string } | Response> {
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
  const allowOrErr = requiredAdminEmailAllowlist();
  if (allowOrErr instanceof Response) return allowOrErr;
  const email = userData.user.email?.trim().toLowerCase();
  if (!email || !allowOrErr.has(email)) {
    return json({ error: 'Forbidden: email not allowed for admin API.' }, 403);
  }
  return { admin, userId: userData.user.id };
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
  const { admin } = gate;

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

    const map = new Map<string, any>();
    for (const row of bizRes.data ?? []) map.set(row.id, { ...row });
    for (const row of payRes.data ?? []) {
      const prev = map.get(row.id);
      map.set(row.id, prev ? { ...prev, ...row } : { ...row });
    }
    const items = Array.from(map.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    return json({ items });
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

  const supplierId = body.supplierId?.trim();
  if (!supplierId) return json({ error: 'supplierId required' }, 400);

  if (body.action === 'approve_business') {
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        verification_status: 'verified',
        business_verification_feedback: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === 'reject_business') {
    const fb = typeof body.feedback === 'string' ? body.feedback.trim() || null : null;
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        verification_status: 'rejected',
        business_verification_feedback: fb,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === 'approve_payout') {
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        payout_verification_status: 'verified',
        payout_verification_feedback: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === 'reject_payout') {
    const fb = typeof body.feedback === 'string' ? body.feedback.trim() || null : null;
    const { error } = await admin
      .from('supplier_profiles')
      .update({
        payout_verification_status: 'rejected',
        payout_verification_feedback: fb,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplierId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
