import { supabase } from '../lib/supabase';

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

/** Throws on Supabase error. */
export async function fetchSupplierEarnings(supplierId: string): Promise<SupplierEarning[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_earnings')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('period_start', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierEarning[];
}
