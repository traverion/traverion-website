import { supabase } from '../lib/supabase';
import { resolveSupplierId } from './supabase-supplier-team';

export type BookingOpsNoteRow = {
  booking_id: string;
  supplier_id: string;
  note: string;
  updated_at: string;
};

export async function fetchSupplierBookingOpsNotes(
  supplierId: string,
  bookingIds: string[]
): Promise<Record<string, { note: string; updatedAt: string }>> {
  if (!supabase || bookingIds.length === 0) return {};
  // Phase 1199: resolve owner id so team JWTs hit owner-keyed rows after 152.
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('supplier_booking_ops_notes')
    .select('booking_id, note, updated_at')
    .eq('supplier_id', ownerSupplierId)
    .in('booking_id', bookingIds);
  if (error) return {};
  const out: Record<string, { note: string; updatedAt: string }> = {};
  (data as { booking_id: string; note: string; updated_at: string }[] | null)?.forEach((r) => {
    out[r.booking_id] = { note: r.note, updatedAt: r.updated_at };
  });
  return out;
}

export async function upsertSupplierBookingOpsNote(
  supplierId: string,
  bookingId: string,
  note: string
): Promise<boolean> {
  if (!supabase) return false;
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { error } = await supabase.from('supplier_booking_ops_notes').upsert(
    {
      booking_id: bookingId,
      supplier_id: ownerSupplierId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'booking_id' }
  );
  return !error;
}

export async function deleteSupplierBookingOpsNote(
  supplierId: string,
  bookingId: string
): Promise<boolean> {
  if (!supabase) return false;
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { error } = await supabase
    .from('supplier_booking_ops_notes')
    .delete()
    .eq('supplier_id', ownerSupplierId)
    .eq('booking_id', bookingId);
  return !error;
}
