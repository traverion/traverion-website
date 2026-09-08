/** Drop persisted Supabase session keys so partner/traveler logout cannot bounce on a stale token. */
export function clearSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (k.startsWith('sb-') && k.includes('auth-token')) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    /* private mode */
  }
}
