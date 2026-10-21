/**
 * Direct-to-storage uploads for communication forms (private bucket via Edge).
 * Never loads entire large videos into base64 — streams File to signed URL.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  COMM_ACCEPT_ATTR,
  COMM_MAX_ATTACHMENTS,
  COMM_MAX_TOTAL_BYTES,
  formatCommFileSize,
  validateCommAttachmentBatch,
  validateCommFileWithSniff,
  type CommAttachmentKind,
} from '../lib/communication-attachments';

export type CommUploadCategory =
  | 'partner_support'
  | 'contact'
  | 'affiliate'
  | 'content_creator'
  | 'supplier';

export type CommUploadedFile = {
  attachmentId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  kind: CommAttachmentKind;
};

export type CommUploadSession = {
  sessionId: string;
  clientToken: string;
  expiresAt: string;
};

async function parseFnError(error: unknown): Promise<string> {
  if (
    error &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context: unknown }).context instanceof Response
  ) {
    try {
      const res = (error as { context: Response }).context;
      const j = (await res.clone().json()) as { error?: string };
      if (j?.error) return j.error;
    } catch {
      /* ignore */
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'Upload failed.';
}

export async function createCommUploadSession(
  category: CommUploadCategory
): Promise<{ ok: true; session: CommUploadSession } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Could not start upload.' };
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    sessionId?: string;
    clientToken?: string;
    expiresAt?: string;
    error?: string;
  }>('communication-upload-session', {
    body: { action: 'create', category },
  });
  if (error) {
    const msg =
      error instanceof FunctionsHttpError ? await parseFnError(error) : await parseFnError(error);
    return { ok: false, error: msg };
  }
  if (!data?.success || !data.sessionId || !data.clientToken) {
    return { ok: false, error: data?.error ?? 'Could not start upload.' };
  }
  return {
    ok: true,
    session: {
      sessionId: data.sessionId,
      clientToken: data.clientToken,
      expiresAt: data.expiresAt ?? '',
    },
  };
}

export async function abandonCommUploadSession(session: CommUploadSession): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke('communication-upload-session', {
      body: {
        action: 'abandon',
        sessionId: session.sessionId,
        clientToken: session.clientToken,
      },
    });
  } catch {
    /* best-effort */
  }
}

async function signAndUploadOne(
  session: CommUploadSession,
  file: File,
  onProgress?: (ratio: number) => void
): Promise<{ ok: true; file: CommUploadedFile } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Could not upload.' };

  const sniffed = await validateCommFileWithSniff(file);
  if (!sniffed.ok) return { ok: false, error: sniffed.error };

  const { data: signData, error: signError } = await supabase.functions.invoke<{
    success?: boolean;
    attachmentId?: string;
    storagePath?: string;
    uploadUrl?: string;
    token?: string;
    contentType?: string;
    kind?: CommAttachmentKind;
    error?: string;
  }>('communication-upload-session', {
    body: {
      action: 'sign',
      sessionId: session.sessionId,
      clientToken: session.clientToken,
      filename: file.name,
      byteSize: file.size,
      contentType: sniffed.mime,
    },
  });

  if (signError || !signData?.success || !signData.uploadUrl || !signData.attachmentId) {
    return {
      ok: false,
      error: signError
        ? await parseFnError(signError)
        : (signData?.error ?? 'Could not authorize upload.'),
    };
  }

  // Prefer token-based uploadToSignedUrl when available; else PUT to signed URL with XHR for progress.
  const token = signData.token;
  const path = signData.storagePath;
  if (token && path) {
    // Progress approximation: 0 → 0.5 before, 1 after (supabase-js lacks progress callbacks).
    onProgress?.(0.15);
    const { error: upErr } = await supabase.storage
      .from('communication-attachments')
      .uploadToSignedUrl(path, token, file, {
        contentType: sniffed.mime,
        upsert: false,
      });
    if (upErr) {
      return { ok: false, error: upErr.message || 'Upload failed.' };
    }
    onProgress?.(0.9);
  } else {
    const putOk = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signData.uploadUrl!);
      xhr.setRequestHeader('Content-Type', sniffed.mime);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) onProgress(Math.min(0.95, ev.loaded / ev.total));
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!putOk) return { ok: false, error: 'Upload failed. Check your connection and try again.' };
  }

  const { data: done, error: doneErr } = await supabase.functions.invoke<{
    success?: boolean;
    attachmentId?: string;
    filename?: string;
    contentType?: string;
    byteSize?: number;
    kind?: CommAttachmentKind;
    error?: string;
  }>('communication-upload-session', {
    body: {
      action: 'complete-file',
      sessionId: session.sessionId,
      clientToken: session.clientToken,
      attachmentId: signData.attachmentId,
    },
  });

  if (doneErr || !done?.success) {
    return {
      ok: false,
      error: doneErr ? await parseFnError(doneErr) : (done?.error ?? 'Could not confirm upload.'),
    };
  }

  onProgress?.(1);
  return {
    ok: true,
    file: {
      attachmentId: done.attachmentId ?? signData.attachmentId,
      filename: done.filename ?? file.name,
      contentType: done.contentType ?? sniffed.mime,
      byteSize: done.byteSize ?? file.size,
      kind: done.kind ?? sniffed.kind,
    },
  };
}

export async function uploadCommFiles(
  category: CommUploadCategory,
  files: File[],
  options?: {
    existingSession?: CommUploadSession | null;
    onFileProgress?: (fileIndex: number, ratio: number) => void;
  }
): Promise<
  | { ok: true; session: CommUploadSession; uploaded: CommUploadedFile[] }
  | { ok: false; error: string; session?: CommUploadSession }
> {
  const batch = validateCommAttachmentBatch(files);
  if (!batch.ok) return { ok: false, error: batch.error };
  if (files.length > COMM_MAX_ATTACHMENTS) {
    return { ok: false, error: `Attach at most ${COMM_MAX_ATTACHMENTS} files.` };
  }

  let session = options?.existingSession ?? null;
  if (!session) {
    const created = await createCommUploadSession(category);
    if (!created.ok) return created;
    session = created.session;
  }

  const uploaded: CommUploadedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const result = await signAndUploadOne(session, files[i], (r) =>
      options?.onFileProgress?.(i, r)
    );
    if (!result.ok) {
      return { ok: false, error: result.error, session };
    }
    uploaded.push(result.file);
  }
  return { ok: true, session, uploaded };
}

export { COMM_ACCEPT_ATTR, COMM_MAX_ATTACHMENTS, COMM_MAX_TOTAL_BYTES, formatCommFileSize };
