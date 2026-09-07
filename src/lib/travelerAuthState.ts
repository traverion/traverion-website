/**
 * Traveler product routing as a state machine.
 * Unknown/loading MUST never redirect.
 */

import { pathEquals } from './authNavigation';

export type TravelerSessionKind = 'unknown' | 'anon' | 'authenticated' | 'recovery';

const TRAVELER_AUTH_PAGES = new Set(['/log-in', '/login', '/sign-up', '/auth']);

/**
 * Destination to send this session, or null = stay.
 * Never returns the current path. Never redirects while unknown.
 */
export function travelerRedirectForSession(input: {
  kind: TravelerSessionKind;
  pathname: string;
}): string | null {
  if (input.kind === 'unknown' || input.kind === 'recovery') return null;
  const p = input.pathname.replace(/\/$/, '') || '/';
  let dest: string | null = null;

  if (input.kind === 'authenticated' && TRAVELER_AUTH_PAGES.has(p)) {
    dest = '/';
  }

  if (!dest) return null;
  if (pathEquals(p, dest)) return null;
  return dest;
}

/** Traveler auth pages must never be partner paths. */
export function travelerAuthPathIsConsumerOnly(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  return p === '/log-in' || p === '/sign-up' || p === '/set-password' || p === '/auth';
}
