import { supabase } from '../lib/supabase';

export type SupplierMessageCampaignRow = {
  id: string;
  supplier_id: string;
  actor_id: string | null;
  subject: string;
  scope: 'selected' | 'filtered';
  filters_snapshot: Record<string, unknown> | null;
  booking_ids: string[];
  recipients: string[];
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  status: 'queued' | 'sent' | 'failed' | 'partial';
  created_at: string;
  updated_at: string;
};

export type SupplierExportRunRow = {
  id: string;
  supplier_id: string;
  actor_id: string | null;
  kind: 'bookings' | 'ops_summary';
  format: 'csv' | 'json';
  scope: 'filtered' | 'selected';
  date_from: string | null;
  date_to: string | null;
  row_count: number;
  filters_snapshot: Record<string, unknown> | null;
  created_at: string;
};

export async function fetchSupplierMessageCampaigns(
  supplierId: string
): Promise<SupplierMessageCampaignRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_message_campaigns')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as SupplierMessageCampaignRow[];
}

export async function fetchSupplierExportRuns(
  supplierId: string
): Promise<SupplierExportRunRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_export_runs')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as SupplierExportRunRow[];
}

export async function insertSupplierMessageCampaign(params: {
  supplierId: string;
  actorId?: string | null;
  subject: string;
  scope: 'selected' | 'filtered';
  bookingIds: string[];
  recipients: string[];
  filtersSnapshot?: Record<string, unknown>;
}): Promise<{ success: boolean; id?: string }> {
  if (!supabase) return { success: false };
  const { data, error } = await supabase
    .from('supplier_message_campaigns')
    .insert({
      supplier_id: params.supplierId,
      actor_id: params.actorId ?? null,
      subject: params.subject,
      scope: params.scope,
      booking_ids: params.bookingIds,
      recipients: params.recipients,
      recipients_count: params.recipients.length,
      filters_snapshot: params.filtersSnapshot ?? null,
      status: 'queued',
    })
    .select('id')
    .single();
  if (error) return { success: false };
  return { success: true, id: data?.id as string | undefined };
}

export async function updateSupplierMessageCampaignStatus(params: {
  campaignId: string;
  supplierId: string;
  status: 'queued' | 'sent' | 'failed' | 'partial';
  sentCount: number;
  failedCount: number;
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('supplier_message_campaigns')
    .update({
      status: params.status,
      sent_count: params.sentCount,
      failed_count: params.failedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.campaignId)
    .eq('supplier_id', params.supplierId);
  return !error;
}

export async function insertSupplierExportRun(params: {
  supplierId: string;
  actorId?: string | null;
  kind: 'bookings' | 'ops_summary';
  format: 'csv' | 'json';
  scope: 'filtered' | 'selected';
  dateFrom?: string;
  dateTo?: string;
  rowCount: number;
  filtersSnapshot?: Record<string, unknown>;
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('supplier_export_runs').insert({
    supplier_id: params.supplierId,
    actor_id: params.actorId ?? null,
    kind: params.kind,
    format: params.format,
    scope: params.scope,
    date_from: params.dateFrom ?? null,
    date_to: params.dateTo ?? null,
    row_count: params.rowCount,
    filters_snapshot: params.filtersSnapshot ?? null,
  });
  return !error;
}

