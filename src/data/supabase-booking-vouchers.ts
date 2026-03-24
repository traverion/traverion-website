import { supabase } from '../lib/supabase';

export type SupplierBookingVoucherRow = {
  id: string;
  booking_id: string;
  supplier_id: string;
  listing_id: string;
  code: string;
  guest_email: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  status: 'active' | 'redeemed' | 'expired';
  notes: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchSupplierBookingVouchers(
  supplierId: string
): Promise<SupplierBookingVoucherRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_booking_vouchers')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as SupplierBookingVoucherRow[];
}

export async function insertSupplierBookingVouchers(
  vouchers: Array<{
    bookingId: string;
    supplierId: string;
    listingId: string;
    code: string;
    guestEmail?: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    status?: 'active' | 'redeemed' | 'expired';
    notes?: string;
    expiresAt?: string;
  }>
): Promise<boolean> {
  if (!supabase || vouchers.length === 0) return false;
  const { error } = await supabase.from('supplier_booking_vouchers').insert(
    vouchers.map((v) => ({
      booking_id: v.bookingId,
      supplier_id: v.supplierId,
      listing_id: v.listingId,
      code: v.code,
      guest_email: v.guestEmail ?? null,
      discount_type: v.discountType,
      discount_value: v.discountValue,
      status: v.status ?? 'active',
      notes: v.notes ?? null,
      expires_at: v.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    }))
  );
  return !error;
}

export async function updateSupplierBookingVoucherStatus(
  supplierId: string,
  voucherId: string,
  status: 'active' | 'redeemed' | 'expired'
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('supplier_booking_vouchers')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('supplier_id', supplierId)
    .eq('id', voucherId);
  return !error;
}

export async function redeemSupplierBookingVoucherByCode(
  supplierId: string,
  code: string
): Promise<{ success: boolean; reason?: 'not_found' | 'already_redeemed' | 'expired'; voucherId?: string }> {
  if (!supabase) return { success: false, reason: 'not_found' };
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { success: false, reason: 'not_found' };

  const { data, error } = await supabase
    .from('supplier_booking_vouchers')
    .select('id, status, expires_at')
    .eq('supplier_id', supplierId)
    .eq('code', normalized)
    .maybeSingle();
  if (error || !data) return { success: false, reason: 'not_found' };
  if (data.status === 'redeemed') return { success: false, reason: 'already_redeemed', voucherId: data.id as string };
  if (data.expires_at && data.expires_at < new Date().toISOString().slice(0, 10)) {
    await updateSupplierBookingVoucherStatus(supplierId, data.id as string, 'expired');
    return { success: false, reason: 'expired', voucherId: data.id as string };
  }

  const ok = await updateSupplierBookingVoucherStatus(supplierId, data.id as string, 'redeemed');
  return ok ? { success: true, voucherId: data.id as string } : { success: false };
}

export async function expireSupplierBookingVouchers(
  supplierId: string
): Promise<boolean> {
  if (!supabase) return false;
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('supplier_booking_vouchers')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('supplier_id', supplierId)
    .eq('status', 'active')
    .lt('expires_at', today);
  return !error;
}

