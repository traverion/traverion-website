import { supabase } from '../lib/supabase';

export async function sendSupplierEmailViaEdge(params: {
  to: string[];
  subject: string;
  body: string;
}): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('send-supplier-message', {
    body: {
      to: params.to,
      subject: params.subject,
      body: params.body,
    },
  });
  if (error) return { success: false, error: error.message };
  return {
    success: !!data?.success,
    providerMessageId: data?.providerMessageId,
    error: data?.error,
  };
}

type SupplierEventType = 'new_booking' | 'booking_cancelled' | 'new_review';

export async function notifySupplierEvent(params: {
  supplierId: string;
  eventType: SupplierEventType;
  listingId?: string;
  listingTitle?: string;
  bookingId?: string;
  bookingDate?: string;
  guests?: number;
  guestName?: string;
  reviewRating?: number;
  reviewTitle?: string;
}): Promise<{ success: boolean; notified?: number; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('notify-supplier-event', {
    body: params,
  });
  if (error) return { success: false, error: error.message };
  return {
    success: !!data?.success,
    notified: typeof data?.notified === 'number' ? data.notified : undefined,
    error: data?.error,
  };
}

