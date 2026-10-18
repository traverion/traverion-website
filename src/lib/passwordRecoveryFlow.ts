import type { SupabaseClient } from '@supabase/supabase-js';

const RECOVERY_SESSION_FLAG = 'traverion_password_recovery_active';

export function markPasswordRecoveryActive(): void {
  try {
    sessionStorage.setItem(RECOVERY_SESSION_FLAG, '1');
  } catch {
    /* private mode */
  }
}

export function clearPasswordRecoveryActive(): void {
  try {
    sessionStorage.removeItem(RECOVERY_SESSION_FLAG);
  } catch {
    /* ignore */
  }
}

export function isPasswordRecoveryActive(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_SESSION_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Parse Supabase auth params from the URL hash (after email link redirect). */
export function parseAuthHashParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return new URLSearchParams();
  return new URLSearchParams(raw);
}

export function isPasswordRecoveryLanding(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = parseAuthHashParams();
  if (hash.get('type') === 'recovery') return true;
  try {
    if (new URLSearchParams(window.location.search).get('type') === 'recovery') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Tokens from a reset email, whether Supabase put them in the hash or the query. */
export function readRecoverySessionTokens(
  search: string,
  hash: string
): { accessToken: string; refreshToken: string } | null {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''));
  const fromSearch = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const source =
    fromHash.get('access_token') && fromHash.get('refresh_token') ? fromHash : fromSearch;
  const accessToken = source.get('access_token')?.trim() ?? '';
  const refreshToken = source.get('refresh_token')?.trim() ?? '';
  if (!accessToken || !refreshToken) return null;
  const type = source.get('type');
  if (type && type !== 'recovery') return null;
  return { accessToken, refreshToken };
}

/** True when the URL still carries tokens from a reset email (PKCE code or hash session). */
export function hasPasswordRecoveryCredentialsInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('code')) return true;
  } catch {
    /* ignore */
  }
  if (isPasswordRecoveryLanding()) return true;
  return readRecoverySessionTokens(window.location.search, window.location.hash) != null;
}

/** Remove tokens from the address bar after the client has read them. */
export function clearAuthHashFromUrl(): void {
  if (typeof window === 'undefined' || !window.location.hash) return;
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

/** Remove PKCE `code` from the query string; keep allowed params like `next`. */
export function stripRecoveryQueryFromUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('code');
  params.delete('type');
  params.delete('access_token');
  params.delete('refresh_token');
  params.delete('expires_in');
  params.delete('expires_at');
  params.delete('token_type');
  const qs = params.toString();
  window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ''));
}

/** Supabase emits this when the URL contains a valid recovery session (after parsing the hash). */
export function subscribePasswordRecovery(
  client: SupabaseClient,
  onRecovery: () => void
): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      markPasswordRecoveryActive();
      onRecovery();
    }
  });
  return () => subscription.unsubscribe();
}

/** Single-flight PKCE exchange — StrictMode double-mount must not burn a one-time code twice. */
let recoveryEstablishInFlight: Promise<'ready' | 'invalid' | 'timeout'> | null = null;

/**
 * On a dedicated reset-password route: establish the recovery session from the email link.
 * Supports PKCE (?code=) and legacy hash tokens (#access_token…&type=recovery).
 */
export async function establishPasswordRecoverySession(
  client: SupabaseClient,
  options?: { timeoutMs?: number }
): Promise<'ready' | 'invalid' | 'timeout'> {
  if (recoveryEstablishInFlight) return recoveryEstablishInFlight;

  recoveryEstablishInFlight = establishPasswordRecoverySessionInner(client, options).finally(() => {
    recoveryEstablishInFlight = null;
  });
  return recoveryEstablishInFlight;
}

async function establishPasswordRecoverySessionInner(
  client: SupabaseClient,
  options?: { timeoutMs?: number }
): Promise<'ready' | 'invalid' | 'timeout'> {
  const hasUrlCreds = hasPasswordRecoveryCredentialsInUrl();
  if (!hasUrlCreds && !isPasswordRecoveryActive()) {
    return 'invalid';
  }

  const code =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null;
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(window.location.href);
    if (error || !data.session) return 'invalid';
    markPasswordRecoveryActive();
    stripRecoveryQueryFromUrl();
    return 'ready';
  }

  const tokens =
    typeof window !== 'undefined'
      ? readRecoverySessionTokens(window.location.search, window.location.hash)
      : null;
  if (tokens) {
    const { data, error } = await client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error || !data.session) return 'invalid';
    markPasswordRecoveryActive();
    clearAuthHashFromUrl();
    stripRecoveryQueryFromUrl();
    return 'ready';
  }

  if (hasUrlCreds || isPasswordRecoveryLanding()) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: 'ready' | 'invalid' | 'timeout') => {
        if (settled) return;
        settled = true;
        unsub();
        clearTimeout(timer);
        resolve(result);
      };

      const activate = () => {
        markPasswordRecoveryActive();
        clearAuthHashFromUrl();
        stripRecoveryQueryFromUrl();
        finish('ready');
      };

      const unsub = subscribePasswordRecovery(client, activate);

      void client.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          finish('invalid');
          return;
        }
        if (session && isPasswordRecoveryLanding()) activate();
      });

      const timer = setTimeout(() => {
        if (isPasswordRecoveryActive()) finish('ready');
        else finish('timeout');
      }, options?.timeoutMs ?? 10_000);
    });
  }

  if (!isPasswordRecoveryActive()) return 'invalid';
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) {
    clearPasswordRecoveryActive();
    return 'invalid';
  }
  return 'ready';
}

export async function updatePasswordAfterRecovery(
  client: SupabaseClient,
  newPassword: string,
  options: { minLength: number }
): Promise<{ error?: string }> {
  if (newPassword.length < options.minLength) {
    return { error: `Use at least ${options.minLength} characters.` };
  }
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('same as') || m.includes('different from the old')) {
      return { error: 'Choose a password that is different from your current one.' };
    }
    return { error: 'Could not update your password. Try the reset link again.' };
  }
  clearPasswordRecoveryActive();
  return {};
}
