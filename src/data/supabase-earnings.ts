import { supabase } from '../lib/supabase';
import { resolveSupplierId } from './supabase-supplier-team';
import { fromMinorUnits } from '../lib/commercial-money';

export type SupplierEarning = {
  id: string;
  supplier_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled';
  invoice_number: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierCommercialTermsRow = {
  id: string;
  supplier_id: string;
  plan_code: string;
  commission_bps: number;
  payout_cadence: string;
  effective_from: string;
  effective_until: string | null;
  status: string;
  note: string | null;
};

export type SupplierEarningItemRow = {
  id: string;
  booking_id: string;
  supplier_id: string;
  currency: string;
  amount_minor: number;
  status: 'pending' | 'eligible' | 'included' | 'paid' | 'reversed';
  experience_at: string | null;
  eligible_at: string | null;
  payout_period_id: string | null;
  sold_at?: string | null;
  service_completed_at?: string | null;
  payment_intent_id?: string | null;
  gross_minor?: number | null;
  commission_minor?: number | null;
  commission_bps?: number | null;
};

export type SupplierPeriodSalesReport = {
  ok: boolean;
  error?: string;
  concept?: string;
  currency?: string;
  from?: string;
  to?: string;
  sale_count?: number;
  gross_minor?: number;
  commission_minor?: number;
  supplier_net_minor?: number;
  note?: string;
};

export type SupplierPeriodEarningsReport = {
  ok: boolean;
  error?: string;
  concept?: string;
  currency?: string;
  from?: string;
  to?: string;
  earning_count?: number;
  supplier_net_minor?: number;
  outstanding_recovery_minor?: number;
  net_after_debt_minor?: number;
  note?: string;
};

export type BookingFinancialHoldRow = {
  id: string;
  booking_id: string;
  supplier_id: string;
  reason_code: string;
  note: string | null;
  active: boolean;
  created_at: string;
};

export type BookingCommercialSnapshotRow = {
  booking_id: string;
  currency: string;
  gross_minor: number;
  commission_minor: number;
  supplier_minor: number;
  remaining_gross_minor: number;
  remaining_commission_minor: number;
  remaining_supplier_minor: number;
  plan_code: string;
  commission_bps: number;
  payout_cadence: string;
};

function isMissingSupplierEarningsTable(message: string, code?: string): boolean {
  if (code === '42P01') return true;
  const m = message.toLowerCase();
  return m.includes('supplier_earnings') && (m.includes('does not exist') || m.includes('not found'));
}

/** Throws on Supabase error unless the earnings table has not been migrated yet (returns []).
 * Phase 1140: resolve team JWT → owner supplier_id. */
export async function fetchSupplierEarnings(supplierId: string): Promise<SupplierEarning[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('supplier_earnings')
    .select('*')
    .eq('supplier_id', ownerSupplierId)
    .order('period_start', { ascending: false });
  if (error) {
    if (isMissingSupplierEarningsTable(error.message, error.code)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SupplierEarning[];
}

export async function fetchSupplierActiveCommercialTerms(
  supplierId: string
): Promise<SupplierCommercialTermsRow | null> {
  if (!supabase) return null;
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('supplier_commercial_terms')
    .select(
      'id, supplier_id, plan_code, commission_bps, payout_cadence, effective_from, effective_until, status, note'
    )
    .eq('supplier_id', ownerSupplierId)
    .eq('status', 'active')
    .is('effective_until', null)
    .maybeSingle();
  if (error) {
    if (/supplier_commercial_terms|does not exist|42P01/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as SupplierCommercialTermsRow) ?? null;
}

export async function fetchSupplierEarningItems(supplierId: string): Promise<SupplierEarningItemRow[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('supplier_earning_items')
    .select(
      'id, booking_id, supplier_id, currency, amount_minor, status, experience_at, eligible_at, payout_period_id, sold_at, service_completed_at, payment_intent_id, gross_minor, commission_minor, commission_bps'
    )
    .eq('supplier_id', ownerSupplierId)
    .order('created_at', { ascending: false });
  if (error) {
    // Phase 5 columns may be missing on older local DBs — fall back to core columns.
    if (/sold_at|service_completed_at|gross_minor|commission_minor|commission_bps|payment_intent_id/i.test(error.message)) {
      const legacy = await supabase
        .from('supplier_earning_items')
        .select(
          'id, booking_id, supplier_id, currency, amount_minor, status, experience_at, eligible_at, payout_period_id'
        )
        .eq('supplier_id', ownerSupplierId)
        .order('created_at', { ascending: false });
      if (legacy.error) {
        if (/supplier_earning_items|does not exist|42P01/i.test(legacy.error.message)) return [];
        throw new Error(legacy.error.message);
      }
      return (legacy.data ?? []) as SupplierEarningItemRow[];
    }
    if (/supplier_earning_items|does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SupplierEarningItemRow[];
}

/** Phase 5 authoritative period sales (net of commission). Supplier-scoped via RPC authz. */
export async function fetchSupplierPeriodSales(input: {
  supplierId: string;
  fromIso: string;
  toIso: string;
  currency?: string;
}): Promise<SupplierPeriodSalesReport> {
  if (!supabase) return { ok: false, error: 'supabase_unavailable' };
  const ownerSupplierId = await resolveSupplierId(input.supplierId);
  const { data, error } = await supabase.rpc('supplier_period_sales', {
    p_supplier_id: ownerSupplierId,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_currency: (input.currency ?? 'EUR').toUpperCase(),
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false, error: 'empty' }) as SupplierPeriodSalesReport;
}

/** Phase 5 authoritative period earnings (completed + cleared). */
export async function fetchSupplierPeriodEarnings(input: {
  supplierId: string;
  fromIso: string;
  toIso: string;
  currency?: string;
}): Promise<SupplierPeriodEarningsReport> {
  if (!supabase) return { ok: false, error: 'supabase_unavailable' };
  const ownerSupplierId = await resolveSupplierId(input.supplierId);
  const { data, error } = await supabase.rpc('supplier_period_earnings', {
    p_supplier_id: ownerSupplierId,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_currency: (input.currency ?? 'EUR').toUpperCase(),
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false, error: 'empty' }) as SupplierPeriodEarningsReport;
}

export async function fetchSupplierActiveFinancialHolds(
  supplierId: string
): Promise<BookingFinancialHoldRow[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('booking_financial_holds')
    .select('id, booking_id, supplier_id, reason_code, note, active, created_at')
    .eq('supplier_id', ownerSupplierId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) {
    if (/booking_financial_holds|does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as BookingFinancialHoldRow[];
}

/** One booking's frozen commercial split. Null when this booking has no snapshot. */
export async function fetchBookingCommercialSnapshot(
  bookingId: string
): Promise<BookingCommercialSnapshotRow | null> {
  if (!supabase || !bookingId) return null;
  const { data, error } = await supabase
    .from('booking_commercial_snapshots')
    .select(
      'booking_id, currency, gross_minor, commission_minor, supplier_minor, remaining_gross_minor, remaining_commission_minor, remaining_supplier_minor, plan_code, commission_bps, payout_cadence'
    )
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) {
    if (/booking_commercial_snapshots|does not exist|42P01/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as BookingCommercialSnapshotRow) ?? null;
}

export async function fetchSupplierCommercialSnapshots(
  supplierId: string
): Promise<BookingCommercialSnapshotRow[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('booking_commercial_snapshots')
    .select(
      'booking_id, currency, gross_minor, commission_minor, supplier_minor, remaining_gross_minor, remaining_commission_minor, remaining_supplier_minor, plan_code, commission_bps, payout_cadence'
    )
    .eq('supplier_id', ownerSupplierId);
  if (error) {
    if (/booking_commercial_snapshots|does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as BookingCommercialSnapshotRow[];
}

export type SupplierPayoutPeriodRow = {
  id: string;
  supplier_id: string;
  currency: string;
  cadence: string;
  period_key: string;
  period_start: string;
  period_end: string;
  scheduled_for: string;
  status: 'drafting' | 'ready' | 'processing' | 'paid' | 'failed' | 'cancelled';
  amount_minor: number;
  item_count: number;
  paid_at: string | null;
  paid_via: string | null;
  note: string | null;
  /** Connect SCAT lifecycle — transfer_completed ≠ bank paid. */
  connect_lifecycle?: string | null;
};

export type SupplierPayoutPeriodItemRow = {
  id: string;
  period_id: string;
  earning_item_id: string;
  booking_id: string;
  amount_minor: number;
};

export async function fetchSupplierPayoutPeriods(supplierId: string): Promise<SupplierPayoutPeriodRow[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('supplier_payout_periods')
    .select(
      'id, supplier_id, currency, cadence, period_key, period_start, period_end, scheduled_for, status, amount_minor, item_count, paid_at, paid_via, note, connect_lifecycle'
    )
    .eq('supplier_id', ownerSupplierId)
    .order('scheduled_for', { ascending: false });
  if (error) {
    if (/supplier_payout_periods|does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SupplierPayoutPeriodRow[];
}

export async function fetchSupplierPayoutPeriodItems(periodId: string): Promise<SupplierPayoutPeriodItemRow[]> {
  if (!supabase || !periodId) return [];
  const { data, error } = await supabase
    .from('supplier_payout_period_items')
    .select('id, period_id, earning_item_id, booking_id, amount_minor')
    .eq('period_id', periodId);
  if (error) {
    if (/supplier_payout_period_items|does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SupplierPayoutPeriodItemRow[];
}

export function earningItemsMajorByStatus(
  items: SupplierEarningItemRow[],
  currency: string
): { pending: number; eligible: number; included: number; paid: number } {
  const cur = currency.toUpperCase();
  const out = { pending: 0, eligible: 0, included: 0, paid: 0 };
  for (const row of items) {
    if (String(row.currency).toUpperCase() !== cur) continue;
    const major = fromMinorUnits(Number(row.amount_minor) || 0);
    if (row.status === 'pending') out.pending += major;
    else if (row.status === 'eligible') out.eligible += major;
    else if (row.status === 'included') out.included += major;
    else if (row.status === 'paid') out.paid += major;
  }
  return out;
}
