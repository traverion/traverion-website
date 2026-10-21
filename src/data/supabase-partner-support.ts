import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { PartnerSupportRelatedArea, PartnerSupportRequestType } from '../lib/partner-support';
import type { CommUploadSession } from './supabase-communication-uploads';

export type SubmitPartnerSupportInput = {
  clientRequestId: string;
  requestType: PartnerSupportRequestType;
  relatedArea: PartnerSupportRelatedArea;
  subject: string;
  message: string;
  pageUrl?: string;
  uploadSession?: CommUploadSession | null;
};

export type SubmitPartnerSupportResult =
  | { ok: true; reference: string; skipped?: boolean }
  | { ok: false; error: string };

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
  return `HTTP ${ctx.status}`;
}

/** Submit a Partner Support request (edge emails info@traverion.com + confirmation). */
export async function submitPartnerSupportRequest(
  input: SubmitPartnerSupportInput
): Promise<SubmitPartnerSupportResult> {
  if (!supabase) return { ok: false, error: 'Could not reach Support. Try again.' };

  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    skipped?: boolean;
    reference?: string;
    error?: string;
  }>('submit-partner-support', {
    body: {
      clientRequestId: input.clientRequestId,
      requestType: input.requestType,
      relatedArea: input.relatedArea,
      subject: input.subject,
      message: input.message,
      pageUrl: input.pageUrl ?? undefined,
      uploadSessionId: input.uploadSession?.sessionId,
      uploadClientToken: input.uploadSession?.clientToken,
    },
  });

  if (error) {
    const fromHttp =
      error instanceof FunctionsHttpError || (error as Error)?.name === 'FunctionsHttpError'
        ? await parseFunctionsHttpError(error)
        : null;
    return {
      ok: false,
      error: fromHttp || (error.message.trim() ? error.message.trim() : 'Could not send your request. Try again.'),
    };
  }

  if (data?.success === true) {
    return {
      ok: true,
      reference: typeof data.reference === 'string' && data.reference.trim() ? data.reference.trim() : '—',
      skipped: data.skipped === true,
    };
  }

  return {
    ok: false,
    error:
      typeof data?.error === 'string' && data.error.trim()
        ? data.error.trim()
        : 'Could not send your request. Try again.',
  };
}
