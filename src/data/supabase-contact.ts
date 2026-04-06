import { supabase } from '../lib/supabase';

/**
 * Rows are ready for Resend (or any mailer): use `subject` as the outgoing email Subject line.
 * `inquiry_type` is `general` | `affiliate` | `content_creator` for filtering and templates.
 */
export type ContactInquiry = {
  id?: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  inquiry_type?: string;
  status?: string;
};

export async function submitContactInquiry(
  data: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }
  const { error } = await supabase.from('contact_inquiries').insert({
    name: data.name,
    email: data.email,
    phone: data.phone ?? null,
    subject: data.subject,
    message: data.message,
    inquiry_type: data.inquiry_type ?? 'general',
    status: data.status ?? 'new',
  });
  if (error) return { success: false, error: error.message };

  try {
    const { error: fnError } = await supabase.functions.invoke('notify-contact-inquiry', {
      body: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? '',
        subject: data.subject,
        message: data.message,
        inquiry_type: data.inquiry_type ?? 'general',
      },
    });
    if (fnError) console.error('notify-contact-inquiry:', fnError.message);
  } catch (e) {
    console.error('notify-contact-inquiry:', e);
  }

  return { success: true };
}
