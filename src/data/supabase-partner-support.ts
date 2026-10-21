import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { PartnerSupportRelatedArea, PartnerSupportRequestType } from '../lib/partner-support';

export type PartnerSupportAttachmentPayload = {
  filename: string;
  contentBase64: string;
  mimeType: string;
};

export type SubmitPartnerSupportInput = {
  clientRequestId: string;
  requestType: PartnerSupportRequestType;
  relatedArea: PartnerSupportRelatedArea;
  subject: string;
  message: string;
  pageUrl?: string;
  attachments?: PartnerSupportAttachmentPayload[];
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
      attachments: input.attachments ?? [],
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

export async function fileToSupportAttachment(
  file: File
): Promise<PartnerSupportAttachmentPayload | { error: string }> {
  const mime = file.type.trim().toLowerCase();
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    return { error: 'Use JPG, PNG, or WebP images only.' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { error: 'Each image must be 2 MB or smaller.' };
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const contentBase64 = btoa(binary);
  return {
    filename: file.name.slice(0, 80) || 'attachment',
    contentBase64,
    mimeType: mime,
  };
}
