import { supabase } from '../lib/supabase';

export type SupplierActivityNotificationRow = {
  id: string;
  supplier_id: string;
  event_type: string;
  title: string;
  body: string;
  listing_id: string | null;
  review_id: string | null;
  href_path: string | null;
  read_at: string | null;
  created_at: string;
};

export async function fetchSupplierActivityNotifications(limit = 30): Promise<SupplierActivityNotificationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_activity_notifications')
    .select('id, supplier_id, event_type, title, body, listing_id, review_id, href_path, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierActivityNotificationRow[];
}

export async function countUnreadSupplierActivityNotifications(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('supplier_activity_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markSupplierActivityNotificationRead(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('supplier_activity_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function markAllSupplierActivityNotificationsRead(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('supplier_activity_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
