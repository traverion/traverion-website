/**
 * Checkout stores machine keys in special_requests (option id, stay check-out, pickup overrides).
 * Travelers and partners should not see those as guest notes.
 */
const INTERNAL_NOTE_LINE =
  /^(booking_option_id|check_out|meeting_point|pickup_instructions|pickup_draft_time|pickup_draft_address|pickup_draft_place|pickup_draft_lat|pickup_draft_lng|pickup_draft_instructions|supplier_pickup_address|supplier_pickup_place|supplier_pickup_lat|supplier_pickup_lng)\s*:/i;

export function guestFacingBookingNotes(raw: string | null | undefined): string {
  return (raw ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !INTERNAL_NOTE_LINE.test(line))
    .join('\n\n')
    .trim();
}

/**
 * Phase 1522: client phone/notes must not plant machine keys (check_out:, meeting_point:, …)
 * that flip tour→stay cancel windows or partner Pickup copy. Only server may append those lines.
 */
export function sanitizeCheckoutGuestPhone(raw: string | null | undefined): string {
  return guestFacingBookingNotes(raw)
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function buildCheckoutClaimSpecialRequests(params: {
  customerPhone?: string | null;
  specialRequests?: string | null;
  /** Server-derived option id only. */
  optionId?: string | null;
  /** Server-derived stay check-out ISO date only. */
  checkOutDate?: string | null;
}): string | null {
  const phone = sanitizeCheckoutGuestPhone(params.customerPhone);
  let guestNotes = guestFacingBookingNotes(params.specialRequests);
  // Phase 1852: if phone is supplied separately, drop any Guest phone lines from notes
  // so client+server cannot double-emit the same line.
  if (phone) {
    guestNotes = guestNotes
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^Guest phone\s*:/i.test(line))
      .join('\n\n')
      .trim();
  }
  const optionId = (params.optionId ?? '').trim();
  const checkOut = (params.checkOutDate ?? '').trim();
  const parts = [
    phone ? `Guest phone: ${phone}` : '',
    guestNotes,
    optionId ? `booking_option_id: ${optionId}` : '',
    /^\d{4}-\d{2}-\d{2}$/.test(checkOut) ? `check_out: ${checkOut}` : '',
  ].filter(Boolean);
  const joined = parts.join('\n\n').trim();
  return joined.length > 0 ? joined : null;
}

function readKeyedNoteLine(notes: string | null | undefined, key: string): string | null {
  if (!notes) return null;
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, 'i');
  for (const raw of notes.split(/\n+/)) {
    const m = raw.trim().match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

/** Per-booking meeting override stored in special_requests (Pickup planner). */
export function parseBookingMeetingPointOverride(notes: string | null | undefined): string | null {
  return readKeyedNoteLine(notes, 'meeting_point');
}

/** Per-booking pickup instructions override stored in special_requests (Pickup planner). */
export function parseBookingPickupInstructionsOverride(notes: string | null | undefined): string | null {
  return readKeyedNoteLine(notes, 'pickup_instructions');
}

/** Upsert machine note lines without wiping guest-facing notes or other keys. */
export function upsertBookingPickupNoteOverrides(
  notes: string | null | undefined,
  meetingPoint: string,
  pickupInstructions: string
): string {
  const lines = (notes ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^(meeting_point|pickup_instructions)\s*:/i.test(l));
  const m = meetingPoint.trim();
  const p = pickupInstructions.trim();
  if (m) lines.push(`meeting_point: ${m}`);
  if (p) lines.push(`pickup_instructions: ${p}`);
  return lines.join('\n');
}

export type PickupDraftRecord = {
  timeHm: string | null;
  address: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  instructions: string | null;
};

export type SupplierPickupPoint = {
  address: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
};

const PICKUP_DRAFT_KEYS = [
  'pickup_draft_time',
  'pickup_draft_address',
  'pickup_draft_place',
  'pickup_draft_lat',
  'pickup_draft_lng',
  'pickup_draft_instructions',
] as const;

const SUPPLIER_PICKUP_KEYS = [
  'supplier_pickup_address',
  'supplier_pickup_place',
  'supplier_pickup_lat',
  'supplier_pickup_lng',
] as const;

function stripKeyedLines(notes: string | null | undefined, keys: readonly string[]): string[] {
  const blocked = new RegExp(`^(${keys.join('|')})\\s*:`, 'i');
  return (notes ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !blocked.test(line));
}

function finiteNoteCoord(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parsePickupDraft(notes: string | null | undefined): PickupDraftRecord | null {
  const timeHm = readKeyedNoteLine(notes, 'pickup_draft_time');
  const address = readKeyedNoteLine(notes, 'pickup_draft_address');
  const placeId = readKeyedNoteLine(notes, 'pickup_draft_place');
  const lat = finiteNoteCoord(readKeyedNoteLine(notes, 'pickup_draft_lat'));
  const lng = finiteNoteCoord(readKeyedNoteLine(notes, 'pickup_draft_lng'));
  const instructions = readKeyedNoteLine(notes, 'pickup_draft_instructions');
  if (!timeHm && !address && !placeId && lat == null && lng == null && !instructions) return null;
  return { timeHm, address, placeId, lat, lng, instructions };
}

export function upsertPickupDraft(notes: string | null | undefined, draft: PickupDraftRecord | null): string {
  const lines = stripKeyedLines(notes, PICKUP_DRAFT_KEYS);
  if (draft) {
    if (draft.timeHm?.trim()) lines.push(`pickup_draft_time: ${draft.timeHm.trim()}`);
    if (draft.address?.trim()) lines.push(`pickup_draft_address: ${draft.address.trim().replace(/\s+/g, ' ')}`);
    if (draft.placeId?.trim()) lines.push(`pickup_draft_place: ${draft.placeId.trim()}`);
    if (draft.lat != null && Number.isFinite(draft.lat)) lines.push(`pickup_draft_lat: ${draft.lat}`);
    if (draft.lng != null && Number.isFinite(draft.lng)) lines.push(`pickup_draft_lng: ${draft.lng}`);
    if (draft.instructions?.trim()) {
      lines.push(`pickup_draft_instructions: ${draft.instructions.trim().replace(/\s+/g, ' ')}`);
    }
  }
  return lines.join('\n');
}

export function parseSupplierPickupPoint(notes: string | null | undefined): SupplierPickupPoint | null {
  const address = readKeyedNoteLine(notes, 'supplier_pickup_address');
  if (!address || address.length < 3) return null;
  return {
    address,
    placeId: readKeyedNoteLine(notes, 'supplier_pickup_place'),
    lat: finiteNoteCoord(readKeyedNoteLine(notes, 'supplier_pickup_lat')),
    lng: finiteNoteCoord(readKeyedNoteLine(notes, 'supplier_pickup_lng')),
  };
}

export function upsertSupplierPickupPoint(
  notes: string | null | undefined,
  point: SupplierPickupPoint | null
): string {
  const lines = stripKeyedLines(notes, SUPPLIER_PICKUP_KEYS);
  if (point?.address.trim()) {
    lines.push(`supplier_pickup_address: ${point.address.trim().replace(/\s+/g, ' ')}`);
    if (point.placeId?.trim()) lines.push(`supplier_pickup_place: ${point.placeId.trim()}`);
    if (point.lat != null && Number.isFinite(point.lat)) lines.push(`supplier_pickup_lat: ${point.lat}`);
    if (point.lng != null && Number.isFinite(point.lng)) lines.push(`supplier_pickup_lng: ${point.lng}`);
  }
  return lines.join('\n');
}

export function guestPhoneFromBookingNotes(notes: string | null | undefined): string | null {
  return readKeyedNoteLine(notes, 'Guest phone');
}
