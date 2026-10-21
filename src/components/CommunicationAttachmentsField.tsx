import { useCallback, useId, useRef, useState } from 'react';
import { FileText, Film, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import {
  abandonCommUploadSession,
  createCommUploadSession,
  uploadCommFiles,
  type CommUploadCategory,
  type CommUploadSession,
  type CommUploadedFile,
} from '../data/supabase-communication-uploads';
import {
  COMM_ACCEPT_ATTR,
  COMM_MAX_ATTACHMENTS,
  COMM_MAX_TOTAL_BYTES,
  formatCommFileSize,
  validateCommFileWithSniff,
  type CommAttachmentKind,
} from '../lib/communication-attachments';

export type CommAttachmentItem = {
  localId: string;
  file: File;
  previewUrl: string | null;
  kind: CommAttachmentKind;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  uploaded?: CommUploadedFile;
};

type Props = {
  category: CommUploadCategory;
  items: CommAttachmentItem[];
  onChange: (items: CommAttachmentItem[]) => void;
  session: CommUploadSession | null;
  onSessionChange: (session: CommUploadSession | null) => void;
  disabled?: boolean;
  hint?: string;
};

function kindIcon(kind: CommAttachmentKind) {
  if (kind === 'pdf') return FileText;
  if (kind === 'video') return Film;
  return ImageIcon;
}

export default function CommunicationAttachmentsField({
  category,
  items,
  onChange,
  session,
  onSessionChange,
  disabled,
  hint,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const totalBytes =
    items.reduce((s, i) => s + i.file.size, 0);

  const ensureSession = useCallback(async (): Promise<CommUploadSession | null> => {
    if (session) return session;
    const created = await createCommUploadSession(category);
    if (!created.ok) {
      setBanner(created.error);
      return null;
    }
    onSessionChange(created.session);
    return created.session;
  }, [category, onSessionChange, session]);

  const uploadNewFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || disabled) return;
    setBanner(null);
    const remaining = COMM_MAX_ATTACHMENTS - items.length;
    if (remaining <= 0) {
      setBanner(`You can attach up to ${COMM_MAX_ATTACHMENTS} files.`);
      return;
    }

    const picked = Array.from(fileList).slice(0, remaining);
    const prepared: CommAttachmentItem[] = [];
    for (const file of picked) {
      const v = await validateCommFileWithSniff(file);
      if (!v.ok) {
        setBanner(v.error);
        continue;
      }
      if (totalBytes + file.size + prepared.reduce((s, p) => s + p.file.size, 0) > COMM_MAX_TOTAL_BYTES) {
        setBanner(`Combined attachments must be ${formatCommFileSize(COMM_MAX_TOTAL_BYTES)} or smaller.`);
        break;
      }
      prepared.push({
        localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: v.kind === 'image' ? URL.createObjectURL(file) : null,
        kind: v.kind,
        progress: 0,
        status: 'queued',
      });
    }
    if (!prepared.length) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const next = [...items, ...prepared];
    onChange(next);

    const sess = await ensureSession();
    if (!sess) {
      onChange(
        next.map((it) =>
          prepared.some((p) => p.localId === it.localId)
            ? { ...it, status: 'error' as const, error: 'Could not start upload.' }
            : it
        )
      );
      return;
    }

    // Upload sequentially with live progress
    let working = [...items, ...prepared.map((p) => ({ ...p, status: 'uploading' as const }))];
    onChange(working);

    for (const prep of prepared) {
      const result = await uploadCommFiles(category, [prep.file], {
        existingSession: sess,
        onFileProgress: (_fi, ratio) => {
          working = working.map((w) =>
            w.localId === prep.localId ? { ...w, progress: ratio, status: 'uploading' } : w
          );
          onChange([...working]);
        },
      });
      if (!result.ok) {
        working = working.map((w) =>
          w.localId === prep.localId
            ? { ...w, status: 'error', error: result.error, progress: 0 }
            : w
        );
        onChange([...working]);
        setBanner(result.error);
        if (result.session) onSessionChange(result.session);
        break;
      }
      if (result.session) onSessionChange(result.session);
      const uploaded = result.uploaded[0];
      working = working.map((w) =>
        w.localId === prep.localId ? { ...w, status: 'done', progress: 1, uploaded } : w
      );
      onChange([...working]);
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const removeItem = async (localId: string) => {
    const hit = items.find((i) => i.localId === localId);
    if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
    const next = items.filter((i) => i.localId !== localId);
    onChange(next);
    if (next.length === 0 && session) {
      await abandonCommUploadSession(session);
      onSessionChange(null);
    }
  };

  const busy = items.some((i) => i.status === 'uploading' || i.status === 'queued');
  const hasErrors = items.some((i) => i.status === 'error');

  return (
    <div className="space-y-2">
      <div
        className={`rounded-xl border border-dashed px-3 py-3 transition-colors ${
          dragOver ? 'border-finland bg-finland/5' : 'border-black/15 bg-paper-raised/40'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadNewFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Paperclip className="h-4 w-4 text-ink-faint shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">
              Drag files here or{' '}
              <button
                type="button"
                className="text-finland font-medium underline-offset-2 hover:underline"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || items.length >= COMM_MAX_ATTACHMENTS}
              >
                browse
              </button>
            </p>
            <p className="text-xs text-ink-faint mt-0.5">
              {hint ??
                `Images & PDF up to 25 MB · video up to 100 MB · max ${COMM_MAX_ATTACHMENTS} files · ${formatCommFileSize(COMM_MAX_TOTAL_BYTES)} total`}
            </p>
          </div>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept={COMM_ACCEPT_ATTR}
            multiple
            disabled={disabled || items.length >= COMM_MAX_ATTACHMENTS}
            onChange={(e) => void uploadNewFiles(e.target.files)}
          />
        </div>
      </div>

      {banner ? (
        <p className="text-sm text-red-700" role="alert">
          {banner}
        </p>
      ) : null}
      {hasErrors ? (
        <p className="text-sm text-red-700" role="alert">
          Remove failed files or try uploading again before sending.
        </p>
      ) : null}
      {busy ? (
        <p className="text-xs text-ink-muted" aria-live="polite">
          Uploading… please wait before submitting.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = kindIcon(item.kind);
            return (
              <li
                key={item.localId}
                className="flex items-center gap-2 rounded-lg bg-paper-raised px-2.5 py-2 ring-1 ring-black/[0.06]"
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover shrink-0"
                  />
                ) : (
                  <span className="h-10 w-10 rounded bg-finland/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-finland" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{item.file.name}</p>
                  <p className="text-xs text-ink-faint">
                    {formatCommFileSize(item.file.size)}
                    {item.status === 'done' ? ' · Ready' : null}
                    {item.status === 'uploading'
                      ? ` · ${Math.round(item.progress * 100)}%`
                      : null}
                    {item.status === 'error' && item.error ? ` · ${item.error}` : null}
                  </p>
                  {item.status === 'uploading' ? (
                    <div className="mt-1 h-1 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className="h-full bg-finland transition-[width] duration-150"
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded-md text-ink-faint hover:text-ink hover:bg-black/5"
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() => void removeItem(item.localId)}
                  disabled={disabled || item.status === 'uploading'}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function commAttachmentsReady(items: CommAttachmentItem[]): boolean {
  if (!items.length) return true;
  return items.every((i) => i.status === 'done' && i.uploaded);
}

export function commAttachmentsBlocking(items: CommAttachmentItem[]): boolean {
  return items.some((i) => i.status === 'uploading' || i.status === 'queued' || i.status === 'error');
}
