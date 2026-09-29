/**
 * Contact / Support / affiliate / creator inquiry submission.
 *
 * Phase 1701: persist via submit_contact_inquiry RPC (returns id despite
 * INSERT-only RLS), then require notify-contact-inquiry success before the UI
 * may show "Message received".
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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

export type ContactNotifyResult = {
  success?: boolean;
  skipped?: boolean;
  error?: string;
  providerMessageId?: string | null;
};

/** Pure: decide whether the edge notify response counts as a completed ops alert. */
export function contactInquiryNotifySucceeded(
  data: ContactNotifyResult | null | undefined,
  invokeError: unknown
): { ok: boolean; error?: string } {
  if (invokeError) {
    const msg =
      invokeError instanceof Error && invokeError.message.trim()
        ? invokeError.message.trim()
        : 'Could not notify Support.';
    return { ok: false, error: msg };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Could not notify Support.' };
  }
  if (data.success === true) return { ok: true };
  const err =
    typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : 'Could not notify Support.';
  return { ok: false, error: err };
}

async function parseFunctionsHttpError(error: unknown): Promise<string | null> {
  const ctx =
    error &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context: unknown }).context instanceof Response
      ? (error as { context: Response }).context
      : null;
  if (!ctx) return null;
  try {
    const clone = ctx.clone();
    const ct = clone.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const j = (await clone.json()) as { error?: string; message?: string };
      if (typeof j?.error === 'string' && j.error.trim()) return j.error.trim();
      if (typeof j?.message === 'string' && j.message.trim()) return j.message.trim();
    } else {
      const text = (await clone.text()).trim();
      if (text) return text.slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  return `HTTP ${ctx.status} from Support notification`;
}

/**
 * Insert contact_inquiries (RPC) then notify ops from the row id only (Phase 1051/1701).
 * Edge re-derives content from DB — body fields are not trusted for email.
 * Success requires both persist and notify (or idempotent skip).
 */
export async function submitContactInquiry(
  data: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const inquiryType = data.inquiry_type ?? 'general';
  const { data: rpcId, error: rpcError } = await supabase.rpc('submit_contact_inquiry', {
    p_name: data.name,
    p_email: data.email,
    p_phone: data.phone ?? null,
    p_subject: data.subject,
    p_message: data.message,
    p_inquiry_type: inquiryType,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }
  const inquiryId = typeof rpcId === 'string' ? rpcId : undefined;
  if (!inquiryId) {
    return { success: false, error: 'Inquiry insert returned no id' };
  }

  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke<ContactNotifyResult>(
      'notify-contact-inquiry',
      { body: { inquiryId } }
    );

    let invokeError: unknown = fnError ?? null;
    if (fnError) {
      const fromHttp =
        fnError instanceof FunctionsHttpError || (fnError as Error)?.name === 'FunctionsHttpError'
          ? await parseFunctionsHttpError(fnError)
          : null;
      if (fromHttp) {
        invokeError = new Error(fromHttp);
      }
    }

    const notify = contactInquiryNotifySucceeded(fnData, invokeError);
    if (!notify.ok) {
      return {
        success: false,
        id: inquiryId,
        error: notify.error ?? 'Could not notify Support.',
      };
    }
  } catch (e) {
    return {
      success: false,
      id: inquiryId,
      error: e instanceof Error ? e.message : 'Could not notify Support.',
    };
  }

  return { success: true, id: inquiryId };
}
