/** Property-wide house rules guests can read. These do not filter search or reject a checkout. */

export type StayPetRule = 'allowed' | 'not_allowed' | 'approval';
export type StayYesNoRule = 'allowed' | 'not_allowed';

export type StayRestrictions = {
  pets?: StayPetRule;
  smoking?: StayYesNoRule;
  parties?: StayYesNoRule;
};

const PETS = new Set<StayPetRule>(['allowed', 'not_allowed', 'approval']);
const YES_NO = new Set<StayYesNoRule>(['allowed', 'not_allowed']);

export function normalizeStayRestrictions(raw: unknown): StayRestrictions | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: StayRestrictions = {};
  if (PETS.has(o.pets as StayPetRule)) out.pets = o.pets as StayPetRule;
  if (YES_NO.has(o.smoking as StayYesNoRule)) out.smoking = o.smoking as StayYesNoRule;
  if (YES_NO.has(o.parties as StayYesNoRule)) out.parties = o.parties as StayYesNoRule;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function stayRestrictionLines(rules: StayRestrictions | null | undefined): string[] {
  if (!rules) return [];
  const lines: string[] = [];
  if (rules.pets === 'allowed') lines.push('Pets allowed');
  if (rules.pets === 'not_allowed') lines.push('No pets');
  if (rules.pets === 'approval') lines.push('Pets allowed with host approval');
  if (rules.smoking === 'allowed') lines.push('Smoking allowed');
  if (rules.smoking === 'not_allowed') lines.push('No smoking');
  if (rules.parties === 'allowed') lines.push('Parties and events allowed');
  if (rules.parties === 'not_allowed') lines.push('No parties or events');
  return lines;
}
