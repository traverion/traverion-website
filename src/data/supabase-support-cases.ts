import { supabase } from '../lib/supabase';
import { userFacingError } from '../lib/userFacingError';

export const SUPPORT_CASE_REASONS = [
  { code: 'operator_no_show', label: 'Operator did not arrive' },
  { code: 'not_provided', label: 'Activity or accommodation not provided' },
  { code: 'operator_unresponsive', label: 'Operator unresponsive' },
  { code: 'refund_problem', label: 'Refund problem' },
  { code: 'pickup_meeting', label: 'Pickup or meeting point problem' },
  { code: 'not_as_described', label: 'Service not as described' },
  { code: 'safety', label: 'Safety concern' },
  { code: 'other', label: 'Other booking issue' },
] as const;

export type SupportCaseReasonCode = (typeof SUPPORT_CASE_REASONS)[number]['code'];

export type BookingSupportCaseRow = {
  id: string;
  public_reference: string;
  booking_id: string;
  listing_id: string;
  supplier_id: string;
  reason_code: string;
  description: string;
  evidence_notes?: string | null;
  status: string;
  priority: string;
  reported_at: string;
  response_due_at?: string | null;
  escalated_at?: string | null;
  supplier_response?: string | null;
  supplier_responded_at?: string | null;
  resolution_code?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  financial_hold_id?: string | null;
  currency?: string | null;
  amount_paid?: number | null;
  created_at: string;
};

export function supportCaseStatusLabel(status: string): string {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'submitted':
      return 'Case submitted';
    case 'under_review':
      return 'Under review';
    case 'waiting_operator':
      return 'Waiting for operator response';
    case 'escalated':
      return 'Escalated — Traverion reviewing';
    case 'resolved':
      return 'Resolution reached';
    case 'closed':
      return 'Closed';
    default:
      return status || 'Open';
  }
}

export function supportCaseReasonLabel(code: string): string {
  return SUPPORT_CASE_REASONS.find((r) => r.code === code)?.label ?? code;
}

function parseRpc(
  data: unknown,
  errMsg: string | undefined,
  fallback: string
): { ok: boolean; error?: string } & Record<string, unknown> {
  if (errMsg) return { ok: false, error: userFacingError(errMsg, fallback) };
  if (!data || typeof data !== 'object') return { ok: false, error: fallback };
  const row = data as Record<string, unknown>;
  if (row.ok === false) {
    return {
      ok: false,
      error: userFacingError(typeof row.error === 'string' ? row.error : fallback, fallback),
      ...row,
    };
  }
  return { ok: true, ...row };
}

export async function openBookingSupportCase(params: {
  bookingId: string;
  reasonCode: SupportCaseReasonCode;
  description: string;
  evidenceNotes?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  id?: string;
  publicReference?: string;
  already?: boolean;
}> {
  if (!supabase) return { ok: false, error: 'Could not open a support case.' };
  const { data, error } = await supabase.rpc('open_booking_support_case', {
    p_booking_id: params.bookingId,
    p_reason_code: params.reasonCode,
    p_description: params.description,
    p_evidence_notes: params.evidenceNotes ?? null,
  });
  const parsed = parseRpc(data, error?.message, 'Could not open a support case.');
  if (!parsed.ok) return parsed;
  const id = typeof parsed.id === 'string' ? parsed.id : undefined;
  const publicReference =
    typeof parsed.public_reference === 'string' ? parsed.public_reference : undefined;
  // Soft notify supplier — case already committed.
  if (id && !parsed.already) {
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('listing_id, guests, guest_name, booking_date, booking_number')
        .eq('id', params.bookingId)
        .maybeSingle();
      if (booking?.listing_id) {
        const { fetchListingSupplierMetaForParty } = await import('./supabase-listings');
        const { resolveSupplierId } = await import('./supabase-supplier-team');
        const { notifySupplierEvent } = await import('./supabase-supplier-messaging');
        const { supplierPortalPublicBaseUrl } = await import('../lib/partnerHost');
        const meta = await fetchListingSupplierMetaForParty(booking.listing_id);
        const supplierId = meta?.supplier_id ? await resolveSupplierId(meta.supplier_id) : null;
        if (supplierId) {
          await notifySupplierEvent({
            supplierId,
            eventType: 'booking_detail_changed',
            listingId: booking.listing_id,
            listingTitle: meta?.title ?? undefined,
            bookingId: params.bookingId,
            bookingDate: booking.booking_date ?? undefined,
            guests: booking.guests ?? undefined,
            guestName: booking.guest_name ?? undefined,
            bookingNumber:
              typeof booking.booking_number === 'number' ? booking.booking_number : undefined,
            changeSummary: `Customer opened support case ${publicReference ?? id} (${params.reasonCode}). Please respond in Bookings.`,
            idempotencyKey: `supplier:support_case_opened:${id}`,
            portalBaseUrl: supplierPortalPublicBaseUrl(),
          });
        }
      }
    } catch {
      // Soft notify only.
    }
  }
  return {
    ok: true,
    already: parsed.already === true,
    id,
    publicReference,
  };
}

export async function respondBookingSupportCase(params: {
  caseId: string;
  response: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Could not send your response.' };
  const { data, error } = await supabase.rpc('respond_booking_support_case', {
    p_case_id: params.caseId,
    p_response: params.response,
  });
  return parseRpc(data, error?.message, 'Could not send your response.');
}

export async function fetchSupportCasesForBookings(
  bookingIds: string[]
): Promise<Record<string, BookingSupportCaseRow[]>> {
  if (!supabase || bookingIds.length === 0) return {};
  const { data, error } = await supabase
    .from('booking_support_cases')
    .select(
      'id, public_reference, booking_id, listing_id, supplier_id, reason_code, description, evidence_notes, status, priority, reported_at, response_due_at, escalated_at, supplier_response, supplier_responded_at, resolution_code, resolution_note, resolved_at, financial_hold_id, currency, amount_paid, created_at'
    )
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const out: Record<string, BookingSupportCaseRow[]> = {};
  for (const row of (data ?? []) as BookingSupportCaseRow[]) {
    const bid = row.booking_id;
    if (!out[bid]) out[bid] = [];
    out[bid].push(row);
  }
  return out;
}

export async function fetchSupplierOpenSupportCases(
  supplierId: string
): Promise<BookingSupportCaseRow[]> {
  if (!supabase || !supplierId) return [];
  const { data, error } = await supabase
    .from('booking_support_cases')
    .select(
      'id, public_reference, booking_id, listing_id, supplier_id, reason_code, description, evidence_notes, status, priority, reported_at, response_due_at, escalated_at, supplier_response, supplier_responded_at, resolution_code, resolution_note, resolved_at, financial_hold_id, currency, amount_paid, created_at'
    )
    .eq('supplier_id', supplierId)
    .in('status', ['submitted', 'under_review', 'waiting_operator', 'escalated'])
    .order('reported_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingSupportCaseRow[];
}
