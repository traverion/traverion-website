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

/** Remove tokens from the address bar after the client has read them. */
export function clearAuthHashFromUrl(): void {
  if (typeof window === 'undefined' || !window.location.hash) return;
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
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

/**
 * On a dedicated reset-password route: wait for Supabase to establish the recovery session.
 * Returns whether the user may set a new password.
 */
export async function establishPasswordRecoverySession(
  client: SupabaseClient,
  options?: { timeoutMs?: number }
): Promise<'ready' | 'invalid' | 'timeout'> {
  if (isPasswordRecoveryLanding()) {
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
        finish('ready');
      };

      const unsub = subscribePasswordRecovery(client, activate);
      void client.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          finish('invalid');
          return;
        }
        // Only trust an existing session when the URL still carries a recovery hash.
        if (session && isPasswordRecoveryLanding()) activate();
      });

      const timer = setTimeout(() => {
        if (isPasswordRecoveryActive()) finish('ready');
        else finish('invalid');
      }, options?.timeoutMs ?? 15_000);
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
  if (error) return { error: error.message };
  clearPasswordRecoveryActive();
  return {};
}
