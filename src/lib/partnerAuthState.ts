/**
 * Partner product routing as a state machine.
 * Unknown/loading/checking MUST never redirect — that is how ping-pong starts.
 */

import { pathEquals } from './authNavigation';
import { sanitizePartnerReturnPath } from './partnerReturnPath';
import {
  PARTNER_APP_BASE,
  PARTNER_LANDING_DEV_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_SIGNUP_PATH,
} from './partnerPortalPaths';

export type PartnerSessionKind =
  | 'unknown'
  | 'anon'
  | 'checking-profile'
  | 'partner'
  | 'traveler-blocked'
  | 'error';

const AUTH_PAGES = new Set([PARTNER_LOGIN_PATH, PARTNER_SIGNUP_PATH]);

function isPartnerAppPath(pathname: string): boolean {
  return pathname === PARTNER_APP_BASE || pathname.startsWith(`${PARTNER_APP_BASE}/`);
}

function isLandingPath(pathname: string, hostname: string): boolean {
  if (pathname === PARTNER_LANDING_DEV_PATH) return true;
  return hostname === 'partner.traverion.com' && pathname === '/';
}

/**
 * Destination to send this session, or null = stay (including loading).
 * Never returns the current path.
 */
export function partnerRedirectForSession(input: {
  kind: PartnerSessionKind;
  pathname: string;
  hostname: string;
  /** Safe /partner… path to reopen after login (session expiry or deep link). */
  returnPath?: string | null;
}): string | null {
  const p = input.pathname.replace(/\/$/, '') || '/';
  let dest: string | null = null;

  if (input.kind === 'unknown' || input.kind === 'checking-profile' || input.kind === 'error') {
    return null;
  }

  if (input.kind === 'anon') {
    if (isPartnerAppPath(p)) dest = PARTNER_LOGIN_PATH;
  } else if (input.kind === 'partner') {
    if (AUTH_PAGES.has(p) || isLandingPath(p, input.hostname)) {
      dest = sanitizePartnerReturnPath(input.returnPath) ?? PARTNER_APP_BASE;
    }
  } else if (input.kind === 'traveler-blocked') {
    if (!AUTH_PAGES.has(p)) dest = PARTNER_LOGIN_PATH;
  }

  if (!dest) return null;
  if (pathEquals(p, dest)) return null;
  return dest;
}
