import { supabase } from '../lib/supabase';

export type SupplierBookingEventType =
  | 'booking_created'
  | 'acknowledged'
  | 'status_confirmed'
  | 'status_cancelled'
  | 'note';

export type SupplierBookingEventRow = {
  id: string;
  booking_id: string;
  supplier_id: string;
  actor_id: string | null;
  event_type: SupplierBookingEventType;
  details: string | null;
  created_at: string;
};

export type SupplierBookingMessageRow = {
  id: string;
  supplier_id: string;
  actor_id: string | null;
  campaign_id?: string | null;
  subject: string;
  recipients: string[];
  booking_ids: string[];
  channel: 'email' | 'sms' | 'other';
  body_preview: string | null;
  delivery_status?: 'queued' | 'sent' | 'failed' | null;
  provider_message_id?: string | null;
  error_message?: string | null;
  created_at: string;
};

export async function fetchSupplierBookingEvents(
  supplierId: string,
  bookingIds: string[]
): Promise<SupplierBookingEventRow[]> {
  if (!supabase || bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('supplier_booking_events')
    .select('*')
    .eq('supplier_id', supplierId)
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as SupplierBookingEventRow[];
}

export async function insertSupplierBookingEvent(params: {
  supplierId: string;
  bookingId: string;
  actorId?: string | null;
  eventType: SupplierBookingEventType;
  details?: string;
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('supplier_booking_events').insert({
    booking_id: params.bookingId,
    supplier_id: params.supplierId,
    actor_id: params.actorId ?? null,
    event_type: params.eventType,
    details: params.details ?? null,
  });
  return !error;
}

export async function fetchSupplierBookingMessages(
  supplierId: string
): Promise<SupplierBookingMessageRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_booking_messages')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as SupplierBookingMessageRow[];
}

export async function insertSupplierBookingMessage(params: {
  supplierId: string;
  actorId?: string | null;
  campaignId?: string;
  subject: string;
  recipients: string[];
  bookingIds: string[];
  channel?: 'email' | 'sms' | 'other';
  bodyPreview?: string;
  deliveryStatus?: 'queued' | 'sent' | 'failed';
  providerMessageId?: string;
  errorMessage?: string;
}): Promise<{ success: boolean; id?: string }> {
  if (!supabase) return { success: false };
  const { data, error } = await supabase
    .from('supplier_booking_messages')
    .insert({
    supplier_id: params.supplierId,
    actor_id: params.actorId ?? null,
    campaign_id: params.campaignId ?? null,
    subject: params.subject,
    recipients: params.recipients,
    booking_ids: params.bookingIds,
    channel: params.channel ?? 'email',
    body_preview: params.bodyPreview ?? null,
    delivery_status: params.deliveryStatus ?? 'queued',
    provider_message_id: params.providerMessageId ?? null,
    error_message: params.errorMessage ?? null,
    })
    .select('id')
    .single();
  if (error) return { success: false };
  return { success: true, id: data?.id as string | undefined };
}

export async function updateSupplierBookingMessageDelivery(params: {
  id: string;
  deliveryStatus: 'queued' | 'sent' | 'failed';
  providerMessageId?: string;
  errorMessage?: string;
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('supplier_booking_messages')
    .update({
      delivery_status: params.deliveryStatus,
      provider_message_id: params.providerMessageId ?? null,
      error_message: params.errorMessage ?? null,
    })
    .eq('id', params.id);
  return !error;
}

