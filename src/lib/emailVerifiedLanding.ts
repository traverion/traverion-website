import { publicSiteBaseUrl } from './publicSiteUrl';
import { supabase } from './supabase';

/** New confirmation emails land on the homepage. The modal reads `verified=1`, then the URL is replaced with `/`. */
export function travelerEmailConfirmRedirectUrl(): string {
  return `${publicSiteBaseUrl()}/?verified=1`;
}

export type EmailVerifyNotice = 'success' | 'expired' | 'invalid' | 'partner';

const NOTICE_KEY = 'traverion_email_verified_notice';

type LocationLike = { pathname: string; search: string; hash: string };

function locationOf(loc?: LocationLike): LocationLike | null {
  if (loc) return loc;
  if (typeof window === 'undefined') return null;
  return window.location;
}

export function isTravelerEmailConfirmLanding(loc?: LocationLike): boolean {
  const location = locationOf(loc);
  if (!location) return false;
  const path = location.pathname.replace(/\/$/, '') || '/';
  if (path === '/email-confirmed' || path === '/email-verified') return true;
  try {
    if (new URLSearchParams(location.search).get('verified') === '1') return true;
  } catch {
    /* ignore */
  }
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const type = hash.get('type');
  if (type === 'recovery') return false;
  return type === 'signup' || type === 'email' || type === 'email_change';
}

/**
 * Notice to paint on the first frame of a confirmation link, before profile checks finish.
 * A successful link shows "Email verified" immediately. A bad hash shows the error instead.
 */
export function immediateEmailVerifyNotice(loc?: LocationLike): EmailVerifyNotice | null {
  const location = locationOf(loc);
  if (!location) return null;
  const path = location.pathname.replace(/\/$/, '') || '/';
  const hashNotice = emailConfirmHashNotice(location.hash);
  const landing = isTravelerEmailConfirmLanding(location);
  if (hashNotice && landing) return hashNotice;
  if (landing) return 'success';
  if (path === '/') return peekEmailVerifyNotice();
  return null;
}

export function emailConfirmHashNotice(hashRaw: string): EmailVerifyNotice | null {
  const hash = new URLSearchParams(hashRaw.replace(/^#/, ''));
  if (!hash.get('error')) return null;
  if (hash.get('type') === 'recovery') return null;
  return hash.get('error_code') === 'otp_expired' ? 'expired' : 'invalid';
}

export function rememberEmailVerifyNotice(notice: EmailVerifyNotice): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, notice);
  } catch {
    /* private mode */
  }
}

export function peekEmailVerifyNotice(): EmailVerifyNotice | null {
  try {
    const raw = sessionStorage.getItem(NOTICE_KEY);
    if (raw === 'success' || raw === 'expired' || raw === 'invalid' || raw === 'partner') return raw;
    return null;
  } catch {
    return null;
  }
}

export function clearEmailVerifyNotice(): void {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    /* ignore */
  }
}

export async function resendTravelerConfirmation(email: string): Promise<{ error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { error: 'Enter your email address, then resend confirmation.' };
  if (!supabase) return { error: 'Authentication is not configured.' };
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalized,
    options: { emailRedirectTo: travelerEmailConfirmRedirectUrl() },
  });
  if (error) return { error: error.message };
  return {};
}
