import type { User } from '@supabase/supabase-js';

/**
 * Supabase signUp returns 200 with no AuthError when the email is already registered
 * (to avoid revealing which emails exist). The user payload then has an empty identities array.
 * @see https://supabase.com/docs/reference/javascript/auth-signup
 */
export function isSignUpEmailAlreadyRegistered(user: User | null | undefined): boolean {
  if (!user) return false;
  const list = user.identities;
  return Array.isArray(list) && list.length === 0;
}
