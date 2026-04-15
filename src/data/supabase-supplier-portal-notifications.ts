import { supabase } from '../lib/supabase';

export type SupplierPortalNotificationVariant = 'info' | 'warning' | 'success';
export type SupplierPortalNotificationAudience = 'all' | 'supplier';

export type SupplierPortalNotificationRow = {
  id: string;
  title: string;
  body: string;
  variant: SupplierPortalNotificationVariant;
  audience: SupplierPortalNotificationAudience;
  supplier_user_id: string | null;
  created_at: string;
};

export async function fetchSupplierPortalNotifications(): Promise<SupplierPortalNotificationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_portal_notifications')
    .select('id, title, body, variant, audience, supplier_user_id, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierPortalNotificationRow[];
}
