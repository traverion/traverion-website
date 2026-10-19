/** Optional guest-facing safety disclosures. Unselected options are not a claim that hazards are absent. */

export const STAY_SAFETY_CONSIDERATIONS = [
  { id: 'open_water', label: 'Nearby lake, river, or other open water' },
  { id: 'uneven_access', label: 'Steep stairs or uneven surfaces' },
  { id: 'other_hazards', label: 'Other potential hazards' },
] as const;

export type StaySafetyConsiderationId = (typeof STAY_SAFETY_CONSIDERATIONS)[number]['id'];

const KNOWN = new Set<string>(STAY_SAFETY_CONSIDERATIONS.map((row) => row.id));

export function normalizeStaySafetyConsiderations(raw: unknown): StaySafetyConsiderationId[] {
  if (!Array.isArray(raw)) return [];
  const selected = new Set<string>();
  for (const item of raw) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (KNOWN.has(id)) selected.add(id);
  }
  return STAY_SAFETY_CONSIDERATIONS.map((row) => row.id).filter((id) => selected.has(id));
}

export function staySafetyConsiderationLines(ids: readonly string[] | null | undefined): string[] {
  if (!ids?.length) return [];
  const selected = new Set(ids);
  return STAY_SAFETY_CONSIDERATIONS.filter((row) => selected.has(row.id)).map((row) => row.label);
}
