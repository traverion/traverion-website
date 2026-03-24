import { supabase } from '../lib/supabase';

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
  const { data, error } = await supabase
    .from('supplier_booking_ops_notes')
    .select('booking_id, note, updated_at')
    .eq('supplier_id', supplierId)
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
  const { error } = await supabase.from('supplier_booking_ops_notes').upsert(
    {
      booking_id: bookingId,
      supplier_id: supplierId,
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
  const { error } = await supabase
    .from('supplier_booking_ops_notes')
    .delete()
    .eq('supplier_id', supplierId)
    .eq('booking_id', bookingId);
  return !error;
}

