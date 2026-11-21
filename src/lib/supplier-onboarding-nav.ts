import {
  SUPPLIER_ONBOARDING_SCREENS,
  screenFromOnboardingUrl,
  type SupplierOnboardingScreenId,
} from './supplier-onboarding-steps';

const ORDER = SUPPLIER_ONBOARDING_SCREENS.map((screen) => screen.id);

function screenOrder(id: SupplierOnboardingScreenId): number {
  return ORDER.indexOf(id);
}

/** The screens for this visit, with the open screen kept even if a later answer would hide it. */
export function initialOnboardingJourney(
  computed: readonly SupplierOnboardingScreenId[],
  current: SupplierOnboardingScreenId
): SupplierOnboardingScreenId[] {
  if (computed.includes(current)) return [...computed];
  const next = [...computed];
  const at = next.findIndex((id) => screenOrder(id) > screenOrder(current));
  next.splice(at === -1 ? next.length : at, 0, current);
  return next;
}

/**
 * Keep every screen up to and including the current one.
 * Later screens come from the latest answers, so a skipped question is not a jump backward.
 */
export function reconcileOnboardingJourney(
  journey: readonly SupplierOnboardingScreenId[],
  current: SupplierOnboardingScreenId,
  computed: readonly SupplierOnboardingScreenId[]
): SupplierOnboardingScreenId[] {
  const at = journey.indexOf(current);
  const prefix = at >= 0 ? [...journey.slice(0, at + 1)] : [current];
  const seen = new Set(prefix);
  const currentOrder = screenOrder(current);
  const future = computed.filter((id) => !seen.has(id) && screenOrder(id) > currentOrder);
  return [...prefix, ...future];
}

export function adjacentOnboardingScreen(
  journey: readonly SupplierOnboardingScreenId[],
  current: SupplierOnboardingScreenId | null,
  direction: 1 | -1
): SupplierOnboardingScreenId | null {
  if (!current) return null;
  const index = journey.indexOf(current);
  if (index < 0) return null;
  return journey[index + direction] ?? null;
}

/** Previous screen in the journey. The first screen has none. */
export function previousOnboardingScreen(
  journey: readonly SupplierOnboardingScreenId[],
  current: SupplierOnboardingScreenId | null
): SupplierOnboardingScreenId | null {
  return adjacentOnboardingScreen(journey, current, -1);
}

export function onboardingMoveDirection(
  journey: readonly SupplierOnboardingScreenId[],
  from: SupplierOnboardingScreenId | null,
  to: SupplierOnboardingScreenId
): 'forward' | 'back' {
  if (!from || from === to) return 'forward';
  const start = journey.indexOf(from);
  const end = journey.indexOf(to);
  if (start >= 0 && end >= 0) return end > start ? 'forward' : 'back';
  return screenOrder(to) > screenOrder(from) ? 'forward' : 'back';
}

export function isEmailConfirmationPath(pathname: string): boolean {
  return /email-verified|email-confirmed|confirm/i.test(pathname);
}

export type OnboardingPopAction =
  | { type: 'stay'; screen: SupplierOnboardingScreenId }
  | { type: 'leave' }
  | { type: 'ignore-email' };

/** Browser history may move between onboarding steps. It must not reopen email confirmation. */
export function onboardingPopAction(input: {
  pathname: string;
  search: string;
  visible: readonly SupplierOnboardingScreenId[];
}): OnboardingPopAction {
  if (isEmailConfirmationPath(input.pathname)) return { type: 'ignore-email' };
  const params = new URLSearchParams(input.search.startsWith('?') ? input.search.slice(1) : input.search);
  const raw = params.get('screen');
  const named =
    raw === 'dob' || raw === 'director' || raw === 'ownership' || raw === 'share'
      ? 'person'
      : raw === 'owner'
        ? 'others'
        : raw === 'consent'
          ? 'status'
          : raw;
  if (named && ORDER.includes(named as SupplierOnboardingScreenId)) {
    return { type: 'stay', screen: named as SupplierOnboardingScreenId };
  }
  if (!params.has('phase')) return { type: 'leave' };
  const requested = screenFromOnboardingUrl(input.search, input.visible);
  if (requested === 'company' || requested === 'documents' || input.visible.includes(requested)) {
    return { type: 'stay', screen: requested };
  }
  return { type: 'leave' };
}

/** Skip a server write when this draft was already saved, or when it would erase a stored name. */
export function onboardingDraftFlush(
  lastSignature: string | null,
  nextSignature: string,
  wouldErase: boolean
): 'skip' | 'write' {
  if (wouldErase) return 'skip';
  if (lastSignature === nextSignature) return 'skip';
  return 'write';
}
export function localDraftWouldEraseServer(
  local: { firstName: string; lastName: string },
  server: Record<string, unknown> | null | undefined
): boolean {
  if (!server || typeof server !== 'object') return false;
  const rep =
    server.rep && typeof server.rep === 'object' && !Array.isArray(server.rep)
      ? (server.rep as Record<string, unknown>)
      : {};
  const serverFirst = typeof rep.first_name === 'string' ? rep.first_name.trim() : '';
  const serverLast = typeof rep.last_name === 'string' ? rep.last_name.trim() : '';
  return Boolean((serverFirst || serverLast) && !local.firstName.trim() && !local.lastName.trim());
}
