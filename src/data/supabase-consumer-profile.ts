import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { normalizePhoneNumber } from '../lib/phoneNormalize';

function normalizePhone(phone: string): string {
  return normalizePhoneNumber(phone);
}

export type ConsumerProfileRow = {
  id: string;
  display_name: string | null;
  contact_phone: string | null;
};

/** Build `consumer_profiles` upsert payload from Supabase Auth user metadata (traveler sign-up / confirm). */
export function consumerProfileEnsurePayloadFromAuthUser(user: User): {
  display_name: string | null;
  contact_phone: string | null;
} {
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const meta = user.user_metadata as {
    phone?: string;
    customer_phone?: string;
    customer_first_name?: string;
    customer_last_name?: string;
  };
  const metaFirst = (meta?.customer_first_name ?? '').trim();
  const metaLast = (meta?.customer_last_name ?? '').trim();
  const displayFromMeta = [metaFirst, metaLast].filter(Boolean).join(' ').trim() || null;
  const phoneRaw = (meta?.customer_phone ?? meta?.phone ?? '').trim();
  const emailLocal = email.includes('@') ? (email.split('@')[0]?.trim() || null) : null;
  return {
    display_name: displayFromMeta ?? emailLocal,
    contact_phone: phoneRaw || null,
  };
}

export async function fetchConsumerProfile(userId: string): Promise<{ id: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('consumer_profiles').select('id').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Full row for the signed-in user only (RLS: own id). */
export async function fetchConsumerProfileRow(userId: string): Promise<ConsumerProfileRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('consumer_profiles')
    .select('id, display_name, contact_phone')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ConsumerProfileRow;
}

/**
 * Update traveler profile (display name + phone). RLS restricts to auth.uid() = id.
 * Phone uniqueness is enforced by DB; returns error message on conflict.
 */
export async function saveConsumerProfile(
  userId: string,
  payload: { displayName: string; phone: string }
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Not configured' };
  const display_name = payload.displayName.trim() || null;
  const normalizedPhone = normalizePhone(payload.phone);
  const digits = normalizedPhone.replace(/\D/g, '');
  if (digits.length > 0 && digits.length < 9) {
    return { success: false, error: 'Enter a valid phone number' };
  }
  const { error } = await supabase.from('consumer_profiles').upsert(
    {
      id: userId,
      display_name,
      contact_phone: digits.length >= 9 ? normalizedPhone : null,
    },
    { onConflict: 'id' }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
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
