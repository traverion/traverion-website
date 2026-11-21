import { screenFromOnboardingUrl, type SupplierOnboardingScreenId } from './supplier-onboarding-steps';

/** Previous visible step. The first screen has none. */
export function previousOnboardingScreen(
  visible: readonly SupplierOnboardingScreenId[],
  current: SupplierOnboardingScreenId | null
): SupplierOnboardingScreenId | null {
  if (!current) return null;
  const index = visible.indexOf(current);
  if (index <= 0) return null;
  return visible[index - 1] ?? null;
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
  if (!params.has('screen') && !params.has('phase')) return { type: 'leave' };
  const requested = screenFromOnboardingUrl(input.search, input.visible);
  if (input.visible.includes(requested)) return { type: 'stay', screen: requested };
  return { type: 'stay', screen: input.visible[0] ?? 'company' };
}

/** An empty local representative must not replace a server draft that already has a name. */
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
