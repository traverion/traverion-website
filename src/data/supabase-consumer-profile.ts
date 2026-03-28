import { supabase } from '../lib/supabase';
import { normalizePhoneNumber } from '../lib/phoneNormalize';

function normalizePhone(phone: string): string {
  return normalizePhoneNumber(phone);
}

export async function isConsumerPhoneAvailable(phone: string): Promise<{ available: boolean; error?: string }> {
  if (!supabase) return { available: false, error: 'Not configured' };
  const normalized = normalizePhone(phone);
  if (!normalized) return { available: false, error: 'Phone number is required' };

  const { data, error } = await supabase.rpc('is_consumer_phone_available', { phone_input: normalized });
  if (error) return { available: false, error: error.message };
  return { available: !!data };
}

export async function ensureConsumerProfile(
  userId: string,
  payload?: { display_name?: string | null; contact_phone?: string | null }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Not configured' };

  const normalizedPhone = payload?.contact_phone ? normalizePhone(payload.contact_phone) : '';
  const row = {
    id: userId,
    ...(payload?.display_name ? { display_name: payload.display_name } : {}),
    ...(normalizedPhone ? { contact_phone: normalizedPhone } : {}),
  };

  const { error } = await supabase.from('consumer_profiles').upsert(row, { onConflict: 'id' });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export { normalizePhone as normalizeConsumerPhone };
