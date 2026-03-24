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

