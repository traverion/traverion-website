/**
 * Mirror of src/lib/stay-cancellation-preset.ts for Deno checkout.
 * Keep in sync — structured cancel terms snapshotted at purchase.
 */

const TRAVERION_STANDARD_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before the scheduled start time. After that, guest-initiated cancellations are not available. If the operator cancels or needs to reschedule (for example due to weather or safety), that is handled from your booking details.';

export type StayCancellationPreset = 'free_24h' | 'free_48h' | 'free_7d' | 'non_refundable';

export const STAY_GUEST_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before check-in (property local time). After that, guest-initiated cancellations are not available. If the host cancels, that is handled from your booking details.';

export const STAY_GUEST_CANCELLATION_POLICY_48H =
  'You may cancel free of charge up to 48 hours before check-in (property local time). After that, guest-initiated cancellations are not available. If the host cancels, that is handled from your booking details.';

export const STAY_GUEST_CANCELLATION_POLICY_7D =
  'You may cancel free of charge up to 7 days before check-in (property local time). After that, guest-initiated cancellations are not available. If the host cancels, that is handled from your booking details.';

export const STAY_GUEST_CANCELLATION_POLICY_NON_REFUNDABLE =
  'This stay is non-refundable for guest-initiated cancellations. If the host cancels, that is handled from your booking details.';

export function isStayCancellationPreset(value: unknown): value is StayCancellationPreset {
  return (
    value === 'free_24h' ||
    value === 'free_48h' ||
    value === 'free_7d' ||
    value === 'non_refundable'
  );
}

export function normalizeStayCancellationPreset(value: unknown): StayCancellationPreset {
  if (isStayCancellationPreset(value)) return value;
  return 'free_24h';
}

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

export function stayGuestCancellationPolicyText(preset: StayCancellationPreset): string {
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

export function resolveListingStayCancellationPreset(
  listingExtras: unknown
): StayCancellationPreset {
  const extras =
    listingExtras && typeof listingExtras === 'object'
      ? (listingExtras as { cancellationPreset?: unknown })
      : null;
  return normalizeStayCancellationPreset(extras?.cancellationPreset);
}

/** Prefer structured listing preset for stays; else listing column / standard tour text. */
export function resolveStayCancellationForSnapshot(params: {
  isStay: boolean;
  listingExtras: unknown;
  listingCancellationPolicy?: string | null;
}): {
  cancellationPreset: StayCancellationPreset | null;
  freeCancelHours: number | null;
  cancellationPolicy: string;
} {
  if (!params.isStay) {
    const raw = (params.listingCancellationPolicy ?? '').trim();
    return {
      cancellationPreset: 'free_24h',
      freeCancelHours: 24,
      cancellationPolicy: raw || TRAVERION_STANDARD_CANCELLATION_POLICY,
    };
  }
  const preset = resolveListingStayCancellationPreset(params.listingExtras);
  const hours = freeCancelHoursForStayPreset(preset);
  return {
    cancellationPreset: preset,
    freeCancelHours: hours,
    cancellationPolicy: stayGuestCancellationPolicyText(preset),
  };
}
