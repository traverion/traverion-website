/**
 * Phase 1053: build PostgREST `or` clauses for admin bookings_list search.
 * Supports guest name/email, booking #, booking UUID, Stripe checkout session
 * (`cs_…`), and payment intent (`pi_…`) so support can resolve “I paid but…”
 * tickets from receipt ids.
 */

export function sanitizeAdminBookingSearch(raw: string): string {
  return raw.replace(/[,()%]/g, '').trim().slice(0, 128);
}

export function adminBookingSearchOrParts(safeSearch: string): string[] {
  const q = safeSearch.trim();
  if (!q) return [];

  const parts = [`guest_name.ilike.%${q}%`, `guest_email.ilike.%${q}%`];

  const asNumber = Number.parseInt(q, 10);
  if (Number.isFinite(asNumber) && asNumber > 0 && String(asNumber) === q) {
    parts.push(`booking_number.eq.${asNumber}`);
  }

  // Booking UUID (with or without braces)
  const uuid = q.replace(/^\{|\}$/g, '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    parts.push(`id.eq.${uuid}`);
  }

  const lower = q.toLowerCase();
  if (lower.startsWith('cs_')) {
    parts.push(`checkout_session_id.eq.${q}`);
  } else if (lower.startsWith('pi_')) {
    parts.push(`payment_intent_id.eq.${q}`);
  } else if (q.length >= 8 && /^(cs_|pi_)/i.test(q) === false) {
    // Partial paste of a Stripe id fragment — still try contains match.
    parts.push(`checkout_session_id.ilike.%${q}%`);
    parts.push(`payment_intent_id.ilike.%${q}%`);
  }

  return parts;
}
