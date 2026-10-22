/**
 * Stay guest-cancellation presets.
 * Snapshotted at purchase; SQL cancel_booking_as_traveler is authoritative.
 *
 * Cutoff boundary (client + SQL): free cancel while
 *   check_in_local - now > freeCancelHours
 * Exactly at the deadline (remaining == freeCancelHours) → no_refund.
 */
import type { CancellationPreset } from '../types/listingExtras';
import {
  STAY_GUEST_CANCELLATION_POLICY,
  TRAVERION_STANDARD_CANCELLATION_POLICY,
} from '../types/listingExtras';

/** Structured stay presets suppliers may select (custom is legacy parse-only). */
export type StayCancellationPreset = 'free_24h' | 'free_48h' | 'free_7d' | 'non_refundable';

export const STAY_CANCELLATION_PRESETS: StayCancellationPreset[] = [
  'free_24h',
  'free_48h',
  'free_7d',
  'non_refundable',
];

/** Guest-facing stay wording for 48h free cancel. */
export const STAY_GUEST_CANCELLATION_POLICY_48H =
  'You may cancel free of charge up to 48 hours before check-in (property local time). After that, guest-initiated cancellations are not available. If the host cancels, that is handled from your booking details.';

/** Guest-facing stay wording for 7-day free cancel. */
export const STAY_GUEST_CANCELLATION_POLICY_7D =
  'You may cancel free of charge up to 7 days before check-in (property local time). After that, guest-initiated cancellations are not available. If the host cancels, that is handled from your booking details.';

/** Guest-facing stay wording for non-refundable stays. */
export const STAY_GUEST_CANCELLATION_POLICY_NON_REFUNDABLE =
  'This stay is non-refundable for guest-initiated cancellations. If the host cancels, that is handled from your booking details.';

/** Hours before local check-in. null = non-refundable (no free window). */
export function freeCancelHoursForStayPreset(
  preset: string | null | undefined
): number | null {
  switch ((preset ?? '').trim()) {
    case 'free_24h':
      return 24;
    case 'free_48h':
      return 48;
    case 'free_7d':
      return 168;
    case 'non_refundable':
      return null;
    default:
      return null;
  }
}

export function isStayCancellationPreset(value: unknown): value is StayCancellationPreset {
  return (
    value === 'free_24h' ||
    value === 'free_48h' ||
    value === 'free_7d' ||
    value === 'non_refundable'
  );
}

export function normalizeStayCancellationPreset(
  value: unknown
): StayCancellationPreset {
  if (isStayCancellationPreset(value)) return value;
  // Legacy "custom" and unknown → platform default 24h (historical SQL enforcement).
  return 'free_24h';
}

export function stayGuestCancellationPolicyText(
  preset: StayCancellationPreset
): string {
  switch (preset) {
    case 'free_48h':
      return STAY_GUEST_CANCELLATION_POLICY_48H;
    case 'free_7d':
      return STAY_GUEST_CANCELLATION_POLICY_7D;
    case 'non_refundable':
      return STAY_GUEST_CANCELLATION_POLICY_NON_REFUNDABLE;
    case 'free_24h':
    default:
      return STAY_GUEST_CANCELLATION_POLICY;
  }
}

export function stayCancellationPresetLabel(preset: StayCancellationPreset): string {
  switch (preset) {
    case 'free_48h':
      return 'Free cancellation until 48 hours before check-in';
    case 'free_7d':
      return 'Free cancellation until 7 days before check-in';
    case 'non_refundable':
      return 'Non-refundable';
    case 'free_24h':
    default:
      return 'Free cancellation until 24 hours before check-in';
  }
}

/**
 * Infer hours from frozen cancellationPolicy text (legacy bookings without structured fields).
 * Defaults to 24 — the hours SQL historically enforced for all traveler self-cancels.
 */
export function inferFreeCancelHoursFromPolicyText(
  policyText: string | null | undefined
): number | null {
  const t = (policyText ?? '').trim().toLowerCase();
  if (!t) return 24;
  if (
    t.includes('non-refundable') ||
    t.includes('non refundable') ||
    t.includes('not refundable') ||
    t.includes('no refund')
  ) {
    // Standard Traverion text also says "not available" after the window — only treat as
    // non-refundable when the whole policy is a non-refundable stay/tour line.
    if (
      t === STAY_GUEST_CANCELLATION_POLICY_NON_REFUNDABLE.toLowerCase() ||
      (t.includes('non-refundable') && !t.includes('up to 24') && !t.includes('up to 48') && !t.includes('up to 7'))
    ) {
      return null;
    }
  }
  if (t.includes('7 days') || t.includes('168 hours') || t.includes('up to 7 day')) return 168;
  if (t.includes('48 hours') || t.includes('48-hour') || t.includes('up to 48')) return 48;
  if (
    t.includes('24 hours') ||
    t.includes('24-hour') ||
    t === TRAVERION_STANDARD_CANCELLATION_POLICY.toLowerCase() ||
    t === STAY_GUEST_CANCELLATION_POLICY.toLowerCase()
  ) {
    return 24;
  }
  // Unknown legacy text: keep the previously enforceable 24h window.
  return 24;
}

export type ResolvedStayCancelPolicy = {
  preset: StayCancellationPreset | null;
  /** null = non-refundable; number = free-cancel hours before local check-in. */
  freeCancelHours: number | null;
  source: 'snapshot_preset' | 'snapshot_hours' | 'policy_text' | 'legacy_default';
};

/**
 * Resolve contractual free-cancel hours from a purchase snapshot.
 * Never reads the live listing — listing edits must not rewrite booked terms.
 */
export function resolveStayCancelPolicyFromSnapshot(snapshot: unknown): ResolvedStayCancelPolicy {
  const snap =
    snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : null;

  const presetRaw = snap?.cancellationPreset;
  if (isStayCancellationPreset(presetRaw)) {
    return {
      preset: presetRaw,
      freeCancelHours: freeCancelHoursForStayPreset(presetRaw),
      source: 'snapshot_preset',
    };
  }

  const hoursRaw = snap?.freeCancelHours;
  if (typeof hoursRaw === 'number' && Number.isFinite(hoursRaw)) {
    const h = Math.floor(hoursRaw);
    if (h <= 0) {
      return { preset: 'non_refundable', freeCancelHours: null, source: 'snapshot_hours' };
    }
    if (h === 24) return { preset: 'free_24h', freeCancelHours: 24, source: 'snapshot_hours' };
    if (h === 48) return { preset: 'free_48h', freeCancelHours: 48, source: 'snapshot_hours' };
    if (h === 168) return { preset: 'free_7d', freeCancelHours: 168, source: 'snapshot_hours' };
    return { preset: null, freeCancelHours: h, source: 'snapshot_hours' };
  }
  // Explicit JSON null for freeCancelHours = non_refundable snapshot.
  if (snap && 'freeCancelHours' in snap && snap.freeCancelHours === null) {
    return { preset: 'non_refundable', freeCancelHours: null, source: 'snapshot_hours' };
  }

  const policy =
    typeof snap?.cancellationPolicy === 'string' ? snap.cancellationPolicy : null;
  if (policy && policy.trim()) {
    const inferred = inferFreeCancelHoursFromPolicyText(policy);
    return {
      preset:
        inferred === null
          ? 'non_refundable'
          : inferred === 24
            ? 'free_24h'
            : inferred === 48
              ? 'free_48h'
              : inferred === 168
                ? 'free_7d'
                : null,
      freeCancelHours: inferred,
      source: 'policy_text',
    };
  }

  // No structured or textual snapshot: historical SQL always used 24h.
  return { preset: 'free_24h', freeCancelHours: 24, source: 'legacy_default' };
}

/** Listing-extras preset for new checkouts (stays). Tours stay on free_24h. */
export function resolveListingStayCancellationPreset(
  listingExtras: unknown
): StayCancellationPreset {
  const extras =
    listingExtras && typeof listingExtras === 'object'
      ? (listingExtras as { cancellationPreset?: unknown })
      : null;
  return normalizeStayCancellationPreset(extras?.cancellationPreset);
}

/** Map listing CancellationPreset (incl. custom) to a stay snap preset. */
export function stayPresetFromListingCancellationPreset(
  preset: CancellationPreset | string | null | undefined
): StayCancellationPreset {
  return normalizeStayCancellationPreset(preset);
}
