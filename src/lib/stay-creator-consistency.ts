import { stayAmenityDisplayList } from './stay-amenities';

/** Arrival methods that match a Self check-in amenity. */
const SELF_ARRIVAL = new Set(['self', 'lockbox', 'smart_lock']);

/**
 * Soft warning when Self check-in is listed but arrival does not match.
 * Does not change saved amenities or arrival method.
 */
export function staySelfCheckInConflict(amenities: readonly string[], arrivalMethod: string): string | null {
  const hasSelf = stayAmenityDisplayList(amenities).some((item) => item.toLowerCase() === 'self check-in');
  if (!hasSelf) return null;
  const method = arrivalMethod.trim();
  if (!method) {
    return 'Self check-in is selected. Choose Self check-in, Lockbox, or Smart lock on the arrival screen so guests are not confused.';
  }
  if (SELF_ARRIVAL.has(method)) return null;
  return 'Self check-in is listed as an amenity, but the arrival method is something else. Update one so guests are not confused.';
}

/**
 * Soft warnings when a highlight claims something missing from amenities.
 * Does not remove supplier-written highlights.
 */
export function stayHighlightAmenityHints(highlights: readonly string[], amenities: readonly string[]): string[] {
  const am = new Set(stayAmenityDisplayList(amenities).map((item) => item.toLowerCase()));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of highlights) {
    const line = raw.trim();
    if (!line) continue;
    const key = line.toLowerCase();
    let hint = '';
    if (/\bsauna\b/.test(key) && !am.has('sauna')) {
      hint = `"${line}" mentions a sauna, but Sauna is not selected in amenities.`;
    } else if (/\bhot tub\b|\bjacuzzi\b|\bhottub\b/.test(key) && !am.has('hot tub')) {
      hint = `"${line}" mentions a hot tub, but Hot tub is not selected in amenities.`;
    } else if (/\bpool\b/.test(key) && !am.has('pool')) {
      hint = `"${line}" mentions a pool, but Pool is not selected in amenities.`;
    } else if (/\bparking\b/.test(key) && !am.has('free parking') && !am.has('paid parking')) {
      hint = `"${line}" mentions parking, but no parking amenity is selected.`;
    } else if (/\bwifi\b|\bwi-fi\b/.test(key) && !am.has('wifi')) {
      hint = `"${line}" mentions Wi-Fi, but Wifi is not selected in amenities.`;
    }
    if (!hint || seen.has(hint)) continue;
    seen.add(hint);
    out.push(hint);
    if (out.length >= 3) break;
  }
  return out;
}
