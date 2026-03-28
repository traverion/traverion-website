import { supabase } from '../lib/supabase';

/** True if this number is not used on any consumer or supplier profile (server normalizes). */
export async function isPhoneAvailableForSignup(phone: string): Promise<{ available: boolean; error?: string }> {
  if (!supabase) return { available: false, error: 'Not configured' };
  const raw = phone.trim();
  if (!raw) return { available: false, error: 'Phone number is required' };

  const { data, error } = await supabase.rpc('is_phone_available_for_signup', { phone_input: raw });
  if (error) return { available: false, error: error.message };
  return { available: !!data };
}
