import type { SupabaseClient } from '@supabase/supabase-js';

/** Supabase emits this when the URL contains a valid recovery session (after parsing the hash). */
export function subscribePasswordRecovery(
  client: SupabaseClient,
  onRecovery: () => void
): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') onRecovery();
  });
  return () => subscription.unsubscribe();
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
  return {};
}
