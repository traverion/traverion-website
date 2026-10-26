/**
 * Supplier rental handover / return ops (authenticated RPC).
 */
import { supabase } from '../lib/supabase';
import type { RentalOpsStatus } from '../lib/rental-booking-domain';

export type SetRentalOpsResult =
  | { ok: true; rentalOpsStatus: RentalOpsStatus; idempotent?: boolean }
  | { ok: false; error: string };

export async function setRentalOpsStatus(
  bookingId: string,
  opsStatus: RentalOpsStatus
): Promise<SetRentalOpsResult> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.rpc('set_rental_ops_status', {
    p_booking_id: bookingId,
    p_ops_status: opsStatus,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string; rentalOpsStatus?: string; idempotent?: boolean } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: row?.error ?? 'Could not update rental status.' };
  }
  return {
    ok: true,
    rentalOpsStatus: (row.rentalOpsStatus as RentalOpsStatus) ?? opsStatus,
    idempotent: row.idempotent === true,
  };
}
