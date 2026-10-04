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
      'id, booking_id, supplier_id, currency, amount_minor, status, experience_at, eligible_at, payout_period_id'
    )
    .eq('supplier_id', ownerSupplierId)
    .order('created_at', { ascending: false });
  if (error) {
    if (/supplier_earning_items|does not exist|42P01/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SupplierEarningItemRow[];
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
