export type CancellationPreset = 'free_24h' | 'free_48h' | 'free_7d' | 'non_refundable' | 'custom';

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
  /** Short note e.g. max guests per departure (not enforced as inventory). */
  capacityNote?: string;
}

const PRESET_BASE: Record<Exclude<CancellationPreset, 'custom'>, string> = {
  free_24h: 'Free cancellation up to 24 hours before the scheduled start time.',
  free_48h: 'Free cancellation up to 48 hours before the scheduled start time.',
  free_7d: 'Free cancellation up to 7 days before the scheduled start time.',
  non_refundable: 'Non-refundable once booked.',
};

export function cancellationPresetLabel(preset: CancellationPreset): string {
  if (preset === 'custom') return '';
  return PRESET_BASE[preset];
}

export function composeCancellationPolicy(
  preset: CancellationPreset,
  extra: string,
  customFull: string
): string {
  const extraTrim = extra.trim();
  const suffix = extraTrim ? ` ${extraTrim}` : '';
  if (preset === 'custom') {
    const core = customFull.trim();
    return (core + suffix).trim() || 'See the operator’s terms for cancellation details.';
  }
  return (PRESET_BASE[preset] + suffix).trim();
}

export function inferCancellationPreset(policy: string | undefined | null): CancellationPreset {
  const p = (policy ?? '').toLowerCase();
  if (!p.trim()) return 'custom';
  if (p.includes('non-refundable') || p.includes('non refundable')) return 'non_refundable';
  if (p.includes('7 day') || p.includes('seven day')) return 'free_7d';
  if (p.includes('48 hour')) return 'free_48h';
  if (p.includes('24 hour')) return 'free_24h';
  return 'custom';
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
  if (typeof o.capacityNote === 'string' && o.capacityNote.trim()) {
    out.capacityNote = o.capacityNote.trim();
  }

  return out;
}

/** Persist non-empty listing extras (includes cancellation preset for re-opening the editor). */
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
  if (extras.cancellationPreset) payload.cancellationPreset = extras.cancellationPreset;
  if (extras.cancellationExtra?.trim()) payload.cancellationExtra = extras.cancellationExtra.trim();
  if (extras.capacityNote?.trim()) payload.capacityNote = extras.capacityNote.trim();
  return Object.keys(payload).length > 0 ? payload : null;
}
