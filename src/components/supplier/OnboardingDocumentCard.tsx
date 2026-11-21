import { useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import {
  getVerificationDocumentDisplayLabel,
  getSignedVerificationDocumentUrl,
  openVerificationDocumentPreview,
} from '../../data/supabase-supplier-profile';
import {
  ONBOARDING_DOCUMENT_LABEL,
  onboardingDocumentState,
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
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
};

export default function OnboardingDocumentCard({
  country,
  path,
  verificationStatus,
  submittedAt,
  busy,
  error,
  onUpload,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const guidance = registrationDocumentGuidance(country);
  const state = onboardingDocumentState({
    uploading: busy,
    path,
    verificationStatus,
    submittedAt,
  });
  const status = ONBOARDING_DOCUMENT_LABEL[state];
  const shownError = localError || error;

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setLabel('');
      setPreviewUrl(null);
      return;
    }
    void getVerificationDocumentDisplayLabel(path).then((next) => {
      if (!cancelled) setLabel(next);
    });
    if (!registrationDocumentIsImage(path)) {
      setPreviewUrl(null);
      return () => {
        cancelled = true;
      };
    }
    void getSignedVerificationDocumentUrl(path).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function take(file: File | null) {
    if (!file || busy) return;
    const problem = registrationDocumentFileError(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    await onUpload(file);
  }

  return (
    <section className="supplier-onboarding-card supplier-document">
      <div className="supplier-document__intro">
        <span className="supplier-document__icon" aria-hidden>
          <FileText className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="supplier-onboarding-field__label">
            <h2>Registration extract</h2>
            <button type="button" className="supplier-onboarding-help" aria-label="About the registration extract">
              ?
              <span className="supplier-onboarding-help__tip" role="tooltip">
                The legal name, business ID, and registered address need to be readable.
              </span>
            </button>
          </div>
          <p className="supplier-onboarding__body">{guidance.summary}</p>
          <p className="supplier-onboarding__body">{guidance.example}</p>
          <p className={`supplier-document__status supplier-document__status--${state}`}>{status}</p>
        </div>
      </div>

      {busy ? (
        <div className="supplier-document__progress" aria-hidden>
          <span />
        </div>
      ) : null}

      {path ? (
        <div className="supplier-document__file">
          {previewUrl ? <img src={previewUrl} alt="" className="supplier-document__preview" /> : null}
          <div className="min-w-0">
            <p className="supplier-document__name">{label || 'Registration extract'}</p>
            <div className="supplier-document__actions">
              <button
                type="button"
                className="tv-btn-ghost min-h-11 px-3 text-sm"
                disabled={busy}
                onClick={() => void openVerificationDocumentPreview(path).then((result) => setLocalError(result.error ?? null))}
              >
                Preview
              </button>
              <button type="button" className="tv-btn-ghost min-h-11 px-3 text-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                Replace
              </button>
              <button type="button" className="tv-btn-ghost min-h-11 px-3 text-sm" disabled={busy} onClick={() => void onRemove()}>
                Remove
              </button>
            </div>
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
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#073b83]/10 text-[#073b83]">
            <Upload className="h-4 w-4" strokeWidth={1.85} aria-hidden />
          </span>
          <span className="text-[15px] font-semibold text-ink">{busy ? 'Uploading…' : 'Choose a file or drop it here'}</span>
          <span className="text-sm text-ink-muted">PDF, JPEG, PNG, or WebP · 5 MB maximum</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        aria-label="Registration extract"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          void take(file);
        }}
      />

      {shownError ? (
        <p className="supplier-onboarding-error" role="alert">
          {shownError}
        </p>
      ) : null}
    </section>
  );
}
