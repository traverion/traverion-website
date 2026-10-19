export const STAY_ARRIVAL_METHODS = [
  ['self', 'Self check-in'],
  ['host', 'Host greeting'],
  ['lockbox', 'Lockbox'],
  ['smart_lock', 'Smart lock'],
  ['reception', 'Reception'],
  ['other', 'Other'],
] as const;

export type StayArrivalMethod = (typeof STAY_ARRIVAL_METHODS)[number][0];

const HINTS: Record<StayArrivalMethod, string> = {
  self: 'Guests let themselves in. Put the door code in the private arrival address on Policies.',
  host: 'You or someone you trust meets the guests.',
  lockbox: 'Guests know a lockbox is used. Put the code in the private arrival address, not here.',
  smart_lock: 'Guests use a smart lock. Put the code in the private arrival address, not here.',
  reception: 'Guests check in at reception or a front desk.',
  other: 'Describe only what can be public. Keep codes and the street address on Policies.',
};

export function stayArrivalMethodLabel(method: string | null | undefined): string {
  return STAY_ARRIVAL_METHODS.find((row) => row[0] === method)?.[1] ?? '';
}

export function stayArrivalMethodHint(method: string | null | undefined): string {
  if (method === 'self' || method === 'host' || method === 'lockbox' || method === 'smart_lock' || method === 'reception' || method === 'other') {
    return HINTS[method];
  }
  return '';
}

/**
 * Public arrival notes must not carry door codes or off-platform booking asks.
 * Private codes belong in the post-payment arrival address.
 */
export function stayPublicArrivalNoteBlocker(note: string | null | undefined): string | null {
  const text = (note ?? '').trim();
  if (!text) return null;
  if (/\b(?:door|access|entry|lock(?:box)?|keypad|smart\s*lock)\s*codes?\b/i.test(text) && /\d{3,}/.test(text)) {
    return 'Do not put door codes in the public arrival note. Use the private arrival address instead.';
  }
  if (/\b(?:pin|code)\s*[:=#]?\s*\d{3,}\b/i.test(text)) {
    return 'Do not put entry codes in the public arrival note. Use the private arrival address instead.';
  }
  return null;
}
