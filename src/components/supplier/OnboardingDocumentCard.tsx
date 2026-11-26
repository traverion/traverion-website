import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, FileText, Image as ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useConfirmPrompt } from '../feedback/useConfirmPrompt';
import { getSignedVerificationDocumentUrl, getVerificationDocumentFileInfo } from '../../data/supabase-supplier-profile';
import {
  formatDocumentSize,
  registrationDocumentFileError,
  registrationDocumentGuidance,
  registrationDocumentIsImage,
} from '../../lib/onboarding-document';

type Props = {
  country: string | null;
  path: string | null;
  verificationStatus: string | null;
  submittedAt: string | null;
  busy: boolean;
  error: string | null;
  onUpload: (file: File, reportProgress?: (ratio: number) => void) => Promise<boolean>;
  onRemove: () => Promise<void>;
};

export default function OnboardingDocumentCard({
  country,
  path,
  verificationStatus: _verificationStatus,
  submittedAt: _submittedAt,
  busy,
  error,
  onUpload,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [pending, setPending] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'image' | 'pdf'>('pdf');
  const [previewBusy, setPreviewBusy] = useState(false);
  const { ask, dialog } = useConfirmPrompt();
  const guidance = registrationDocumentGuidance(country);
  const shownError = localError || error;
  const saved = Boolean(path?.trim()) && !busy;
  const name = saved ? label || 'Business registration document' : pending?.name || 'Business registration document';
  const sizeLabel = formatDocumentSize(saved ? sizeBytes : pending?.size);
  const progressLabel = progress == null ? null : `${Math.round(progress * 100)}%`;

  useDialogFocus(previewUrl != null, previewRef, closePreview);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setLabel('');
      setSizeBytes(null);
      return;
    }
    void getVerificationDocumentFileInfo(path).then((info) => {
      if (cancelled) return;
      setLabel(info.name);
      setSizeBytes(info.sizeBytes);
      setPending(null);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function closePreview() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewBusy(false);
  }

  async function take(file: File | null) {
    if (!file || busy) return;
    const problem = registrationDocumentFileError(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    setPending({ name: file.name, size: file.size });
    setProgress(0);
    const ok = await onUpload(file, setProgress);
    setProgress(null);
    if (!ok) setPending(null);
  }

  async function preview() {
    if (!path || previewBusy) return;
    setPreviewBusy(true);
    setLocalError(null);
    const signed = await getSignedVerificationDocumentUrl(path);
    if (!signed) {
      setPreviewBusy(false);
      setLocalError('Could not open document.');
      return;
    }
    try {
      const response = await fetch(signed);
      if (!response.ok) throw new Error('load');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewKind(blob.type.startsWith('image/') || registrationDocumentIsImage(path) ? 'image' : 'pdf');
      setPreviewUrl(url);
    } catch {
      setLocalError('Could not open document.');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function remove() {
    if (!path || busy) return;
    const confirmed = await ask({
      title: 'Remove this document?',
      description: 'It will be taken off this draft. You can upload another file before you submit.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    await onRemove();
  }

  return (
    <section className="supplier-document">
      <header className="supplier-document__head">
        <div className="supplier-onboarding-field__label">
          <h2>Business registration document</h2>
          <button type="button" className="supplier-onboarding-help" aria-label="About the business registration document">
            ?
            <span className="supplier-onboarding-help__tip" role="tooltip">
              {guidance.summary} {guidance.example} The legal name, business ID, and registered address need to be readable.
            </span>
          </button>
        </div>
      </header>

      {saved ? (
          <div className="supplier-document__file">
            <span className="supplier-document__icon" aria-hidden>
              {registrationDocumentIsImage(path || '') ? (
                <ImageIcon className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <FileText className="h-5 w-5" strokeWidth={1.75} />
              )}
            </span>
            <div className="supplier-document__meta">
              <p className="supplier-document__name" title={name}>
                <span>{name}</span>
                <Check className="supplier-document__check h-3.5 w-3.5" strokeWidth={2.5} aria-label="Document saved" />
              </p>
              {sizeLabel ? <p className="supplier-document__size">{sizeLabel}</p> : null}
            </div>
            <div className="supplier-document__actions">
              <button type="button" className="supplier-document__action" disabled={previewBusy} onClick={() => void preview()}>
                <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Preview
              </button>
              <button type="button" className="supplier-document__action" onClick={() => inputRef.current?.click()}>
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Replace
              </button>
              <button type="button" className="supplier-document__remove" onClick={() => void remove()}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`lc-upload supplier-document__drop ${dragOver ? 'lc-upload--active' : ''}`}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              void take(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <span className="supplier-document__icon" aria-hidden>
              <Upload className="h-4 w-4" strokeWidth={1.85} />
            </span>
            <span className="supplier-document__drop-title">{busy ? pending?.name || 'Uploading…' : 'Choose a file or drop it here'}</span>
            <span className="supplier-document__drop-meta">
              {busy ? progressLabel || 'Uploading…' : 'PDF, JPEG, PNG, or WebP · 10 MB maximum'}
            </span>
            {busy ? (
              <span
                className="supplier-document__progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((progress ?? 0) * 100)}
                aria-label="Upload progress"
              >
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </span>
            ) : null}
          </button>
        )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        aria-label="Business registration document"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          void take(file);
        }}
      />

      {shownError ? (
        <p className="supplier-onboarding-field__error" role="alert">
          {shownError}
        </p>
      ) : null}
      {dialog}
      {previewUrl
        ? createPortal(
            <div className="tv-sheet-overlay tv-sheet-overlay--portal supplier-document-modal">
              <div
                ref={previewRef}
                className="supplier-document-modal__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="supplier-document-preview-title"
              >
                <header className="supplier-document-modal__bar">
                  <h2 id="supplier-document-preview-title">{name}</h2>
                  <button type="button" className="supplier-document__action" onClick={closePreview}>
                    Close
                  </button>
                </header>
                {previewKind === 'image' ? (
                  <img src={previewUrl} alt={name} className="supplier-document-modal__image" />
                ) : (
                  <iframe title={name} src={previewUrl} className="supplier-document-modal__frame" />
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
