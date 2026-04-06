/** Legacy preset values still parsed from stored `listing_extras` JSON. */
export type CancellationPreset = 'free_24h' | 'free_48h' | 'free_7d' | 'non_refundable' | 'custom';

/**
 * Standard Traverion cancellation terms for all listings (not supplier-editable).
 * Saved on every listing create/update from the partner form.
 */
export const TRAVERION_STANDARD_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before the scheduled start time. After that, guest-initiated cancellations are not available. If the operator cancels or needs to reschedule (for example due to weather or safety), that is handled from your booking details.';

export type VenueSetting = 'unspecified' | 'indoor' | 'outdoor' | 'mixed';

export type ScheduleStyle = 'flexible' | 'fixed_slots' | 'on_request';

export interface ListingExtras {
  additionalLanguages?: string[];
  venueSetting?: VenueSetting;
  accessibilitySummary?: string;
  minGuestAge?: string;
  scheduleStyle?: ScheduleStyle;
  typicalTimelineNotes?: string;
  galleryImageUrls?: string[];
  cancellationPreset?: CancellationPreset;
  cancellationExtra?: string;
}

export function parseListingExtras(raw: unknown): ListingExtras {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: ListingExtras = {};

  if (Array.isArray(o.additionalLanguages)) {
    out.additionalLanguages = o.additionalLanguages.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  const vs = o.venueSetting;
  if (vs === 'indoor' || vs === 'outdoor' || vs === 'mixed' || vs === 'unspecified') {
    out.venueSetting = vs;
  }
  if (typeof o.accessibilitySummary === 'string' && o.accessibilitySummary.trim()) {
    out.accessibilitySummary = o.accessibilitySummary.trim();
  }
  if (typeof o.minGuestAge === 'string' && o.minGuestAge.trim()) {
    out.minGuestAge = o.minGuestAge.trim();
  }
  const ss = o.scheduleStyle;
  if (ss === 'flexible' || ss === 'fixed_slots' || ss === 'on_request') {
    out.scheduleStyle = ss;
  }
  if (typeof o.typicalTimelineNotes === 'string' && o.typicalTimelineNotes.trim()) {
    out.typicalTimelineNotes = o.typicalTimelineNotes.trim();
  }
  if (Array.isArray(o.galleryImageUrls)) {
    out.galleryImageUrls = o.galleryImageUrls.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  const cp = o.cancellationPreset;
  if (cp === 'free_24h' || cp === 'free_48h' || cp === 'free_7d' || cp === 'non_refundable' || cp === 'custom') {
    out.cancellationPreset = cp;
  }
  if (typeof o.cancellationExtra === 'string' && o.cancellationExtra.trim()) {
    out.cancellationExtra = o.cancellationExtra.trim();
  }

  return out;
}

/** Persist non-empty listing extras (cancellation preset/extra are legacy-only in DB; no longer written). */
export function listingExtrasToDb(extras: ListingExtras | undefined): Record<string, unknown> | null {
  if (!extras) return null;
  const payload: Record<string, unknown> = {};
  if (extras.additionalLanguages?.length) payload.additionalLanguages = extras.additionalLanguages;
  if (extras.venueSetting && extras.venueSetting !== 'unspecified') payload.venueSetting = extras.venueSetting;
  if (extras.accessibilitySummary?.trim()) payload.accessibilitySummary = extras.accessibilitySummary.trim();
  if (extras.minGuestAge?.trim()) payload.minGuestAge = extras.minGuestAge.trim();
  if (extras.scheduleStyle) payload.scheduleStyle = extras.scheduleStyle;
  if (extras.typicalTimelineNotes?.trim()) payload.typicalTimelineNotes = extras.typicalTimelineNotes.trim();
  if (extras.galleryImageUrls?.length) payload.galleryImageUrls = extras.galleryImageUrls;
  return Object.keys(payload).length > 0 ? payload : null;
}
