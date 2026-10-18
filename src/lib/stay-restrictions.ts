/** Property-wide house rules guests can read. These do not filter search or reject a checkout. */

export type StayPetRule = 'allowed' | 'not_allowed' | 'approval';
export type StayYesNoRule = 'allowed' | 'not_allowed';
export type StayChildrenRule = 'welcome' | 'not_suitable';

export type StayQuietHours = { start: string; end: string };

export type StayRestrictions = {
  pets?: StayPetRule;
  smoking?: StayYesNoRule;
  parties?: StayYesNoRule;
  children?: StayChildrenRule;
  quietHours?: StayQuietHours;
};

const PETS = new Set<StayPetRule>(['allowed', 'not_allowed', 'approval']);
const YES_NO = new Set<StayYesNoRule>(['allowed', 'not_allowed']);
const CHILDREN = new Set<StayChildrenRule>(['welcome', 'not_suitable']);
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function clock(value: unknown): string | null {
  if (typeof value !== 'string' || !CLOCK.test(value.trim())) return null;
  return value.trim().slice(0, 5);
}

export function normalizeStayRestrictions(raw: unknown): StayRestrictions | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: StayRestrictions = {};
  if (PETS.has(o.pets as StayPetRule)) out.pets = o.pets as StayPetRule;
  if (YES_NO.has(o.smoking as StayYesNoRule)) out.smoking = o.smoking as StayYesNoRule;
  if (YES_NO.has(o.parties as StayYesNoRule)) out.parties = o.parties as StayYesNoRule;
  if (CHILDREN.has(o.children as StayChildrenRule)) out.children = o.children as StayChildrenRule;
  const quiet = o.quietHours;
  if (quiet && typeof quiet === 'object' && !Array.isArray(quiet)) {
    const row = quiet as Record<string, unknown>;
    const start = clock(row.start);
    const end = clock(row.end);
    if (start && end && start !== end) out.quietHours = { start, end };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function stayRestrictionLines(rules: StayRestrictions | null | undefined): string[] {
  if (!rules) return [];
  const lines: string[] = [];
  if (rules.quietHours) lines.push(`Quiet hours ${rules.quietHours.start}–${rules.quietHours.end}`);
  if (rules.pets === 'allowed') lines.push('Pets allowed');
  if (rules.pets === 'not_allowed') lines.push('No pets');
  if (rules.pets === 'approval') lines.push('Pets allowed with host approval');
  if (rules.smoking === 'allowed') lines.push('Smoking allowed');
  if (rules.smoking === 'not_allowed') lines.push('No smoking');
  if (rules.parties === 'allowed') lines.push('Parties and events allowed');
  if (rules.parties === 'not_allowed') lines.push('No parties or events');
  if (rules.children === 'welcome') lines.push('Children and infants are welcome');
  if (rules.children === 'not_suitable') lines.push('Not suitable for children or infants');
  return lines;
}
