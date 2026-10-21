/**
 * Contact / affiliate / creator / supplier inquiry submission.
 * Persist via submit_contact_inquiry RPC, then notify-contact-inquiry (ops + confirm).
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { CommUploadSession } from './supabase-communication-uploads';

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
  booking_reference?: string;
  structured_data?: Record<string, unknown>;
};

export type ContactNotifyResult = {
  success?: boolean;
  skipped?: boolean;
  error?: string;
  providerMessageId?: string | null;
  reference?: string;
  confirmSent?: boolean;
};

export type SubmitContactResult =
  | { success: true; id: string; reference: string; confirmSent?: boolean }
  | { success: false; error: string; id?: string; reference?: string };

/** Pure: decide whether the edge notify response counts as a completed ops alert. */
export function contactInquiryNotifySucceeded(
  data: ContactNotifyResult | null | undefined,
  invokeError: unknown
): { ok: boolean; error?: string; reference?: string; confirmSent?: boolean } {
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
  if (data.success === true) {
    return {
      ok: true,
      reference: typeof data.reference === 'string' ? data.reference : undefined,
      confirmSent: data.confirmSent === true || data.skipped === true,
    };
  }
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
 * Insert contact_inquiries (RPC) then notify ops + confirmation from the row id.
 */
export async function submitContactInquiry(
  data: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'>,
  options?: { uploadSession?: CommUploadSession | null }
): Promise<SubmitContactResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const inquiryType = data.inquiry_type ?? 'general';
  const { data: rpcData, error: rpcError } = await supabase.rpc('submit_contact_inquiry', {
    p_name: data.name,
    p_email: data.email,
    p_phone: data.phone ?? null,
    p_subject: data.subject,
    p_message: data.message,
    p_inquiry_type: inquiryType,
    p_booking_reference: data.booking_reference ?? null,
    p_structured_data: data.structured_data ?? {},
    p_upload_session_id: options?.uploadSession?.sessionId ?? null,
    p_client_request_id: null,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  // New RPC returns jsonb { id, reference }; old overload returns uuid string.
  let inquiryId: string | undefined;
  let reference = '';
  if (typeof rpcData === 'string') {
    inquiryId = rpcData;
  } else if (rpcData && typeof rpcData === 'object') {
    const obj = rpcData as { id?: string; reference?: string };
    inquiryId = typeof obj.id === 'string' ? obj.id : undefined;
    reference = typeof obj.reference === 'string' ? obj.reference : '';
  }

  if (!inquiryId) {
    return { success: false, error: 'Inquiry insert returned no id' };
  }

  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke<ContactNotifyResult>(
      'notify-contact-inquiry',
      {
        body: {
          inquiryId,
          uploadClientToken: options?.uploadSession?.clientToken,
        },
      }
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
        reference: notify.reference || reference,
        error: notify.error ?? 'Could not notify Support.',
      };
    }
    return {
      success: true,
      id: inquiryId,
      reference: notify.reference || reference || '—',
      confirmSent: notify.confirmSent,
    };
  } catch (e) {
    return {
      success: false,
      id: inquiryId,
      reference,
      error: e instanceof Error ? e.message : 'Could not notify Support.',
    };
  }
}
