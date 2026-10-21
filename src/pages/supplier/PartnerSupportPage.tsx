import { useCallback, useId, useRef, useState } from 'react';
import { CheckCircle2, Paperclip, X } from 'lucide-react';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import {
  fileToSupportAttachment,
  submitPartnerSupportRequest,
  type PartnerSupportAttachmentPayload,
} from '../../data/supabase-partner-support';
import {
  PARTNER_SUPPORT_ALLOWED_MIME,
  PARTNER_SUPPORT_MAX_ATTACHMENTS,
  PARTNER_SUPPORT_MAX_FILE_BYTES,
  PARTNER_SUPPORT_RELATED_AREAS,
  PARTNER_SUPPORT_REQUEST_TYPES,
  isPartnerSupportRelatedArea,
  isPartnerSupportRequestType,
  type PartnerSupportRelatedArea,
  type PartnerSupportRequestType,
} from '../../lib/partner-support';

type LocalAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  payload?: PartnerSupportAttachmentPayload;
  error?: string;
};

function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ps-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PartnerSupportPage() {
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [requestType, setRequestType] = useState<PartnerSupportRequestType | ''>('');
  const [relatedArea, setRelatedArea] = useState<PartnerSupportRelatedArea | ''>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [clientRequestId, setClientRequestId] = useState(newClientRequestId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successRef, setSuccessRef] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setRequestType('');
    setRelatedArea('');
    setSubject('');
    setMessage('');
    setAttachments((prev) => {
      for (const a of prev) URL.revokeObjectURL(a.previewUrl);
      return [];
    });
    setClientRequestId(newClientRequestId());
    setFieldErrors({});
    setError(null);
  }, []);

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    const remaining = PARTNER_SUPPORT_MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${PARTNER_SUPPORT_MAX_ATTACHMENTS} images.`);
      return;
    }
    const next: LocalAttachment[] = [...attachments];
    for (const file of Array.from(fileList).slice(0, remaining)) {
      if (!(PARTNER_SUPPORT_ALLOWED_MIME as readonly string[]).includes(file.type)) {
        setError('Attachments must be JPG, PNG, or WebP.');
        continue;
      }
      if (file.size > PARTNER_SUPPORT_MAX_FILE_BYTES) {
        setError('Each image must be 2 MB or smaller.');
        continue;
      }
      const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);
      const converted = await fileToSupportAttachment(file);
      if ('error' in converted) {
        URL.revokeObjectURL(previewUrl);
        setError(converted.error);
        continue;
      }
      next.push({ id, file, previewUrl, payload: converted });
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const hit = prev.find((a) => a.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!requestType || !isPartnerSupportRequestType(requestType)) {
      next.requestType = 'Choose a request type.';
    }
    if (!relatedArea || !isPartnerSupportRelatedArea(relatedArea)) {
      next.relatedArea = 'Choose what this is related to.';
    }
    if (subject.trim().length < 3) next.subject = 'Enter a subject (at least 3 characters).';
    if (message.trim().length < 10) next.message = 'Enter a message (at least 10 characters).';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;
    if (!isPartnerSupportRequestType(requestType) || !isPartnerSupportRelatedArea(relatedArea)) return;

    setSubmitting(true);
    try {
      const result = await submitPartnerSupportRequest({
        clientRequestId,
        requestType,
        relatedArea,
        subject: subject.trim(),
        message: message.trim(),
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        attachments: attachments.map((a) => a.payload!).filter(Boolean),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessRef(result.reference);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  if (successRef) {
    return (
      <div className={SUPPLIER_PAGE_CLASS}>
        <SupplierPageHero
          title="Support"
          description="Need assistance or have an idea? Send a request to our team."
        />
        <div className="mx-auto w-full max-w-[920px]">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-8 text-center shadow-sm sm:px-8">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ecfdf5] text-[#047857]">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </span>
            <p className="mt-4 text-[17px] font-semibold tracking-tight text-[#18181b]">
              Your request has been sent.
            </p>
            <p className="mt-2 text-[13px] text-[#52525b]">
              Our team will respond by email. Keep an eye on your inbox.
            </p>
            {successRef !== '—' ? (
              <p className="mt-3 text-[12px] font-medium text-[#71717a]">
                Reference: <span className="tabular-nums text-[#18181b]">{successRef}</span>
              </p>
            ) : null}
            <button
              type="button"
              className="tv-btn-primary mt-6 inline-flex h-10 items-center justify-center px-4 text-[13px]"
              onClick={() => setSuccessRef(null)}
            >
              Send another request
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero
        title="Support"
        description="Need assistance or have an idea? Send a request to our team."
      />

      <form
        id={formId}
        onSubmit={(e) => void onSubmit(e)}
        className="mx-auto w-full max-w-[920px] space-y-5"
        noValidate
      >
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span id={`${formId}-type-label`} className="mb-1 block text-[11px] font-semibold text-[#71717a]">
                Request type
              </span>
              <PartnerSelect
                id={`${formId}-type`}
                aria-labelledby={`${formId}-type-label`}
                aria-invalid={Boolean(fieldErrors.requestType)}
                value={requestType}
                placeholder="Select…"
                onChange={(v) => {
                  setRequestType(isPartnerSupportRequestType(v) ? v : '');
                  setFieldErrors((f) => ({ ...f, requestType: '' }));
                }}
                options={[
                  { value: '', label: 'Select…' },
                  ...PARTNER_SUPPORT_REQUEST_TYPES.map((t) => ({ value: t.value, label: t.label })),
                ]}
              />
              {fieldErrors.requestType ? (
                <p className="mt-1 text-[12px] text-red-800">{fieldErrors.requestType}</p>
              ) : null}
            </div>
            <div>
              <span id={`${formId}-area-label`} className="mb-1 block text-[11px] font-semibold text-[#71717a]">
                Related to
              </span>
              <PartnerSelect
                id={`${formId}-area`}
                aria-labelledby={`${formId}-area-label`}
                aria-invalid={Boolean(fieldErrors.relatedArea)}
                searchable
                value={relatedArea}
                placeholder="Select…"
                onChange={(v) => {
                  setRelatedArea(isPartnerSupportRelatedArea(v) ? v : '');
                  setFieldErrors((f) => ({ ...f, relatedArea: '' }));
                }}
                options={[
                  { value: '', label: 'Select…' },
                  ...PARTNER_SUPPORT_RELATED_AREAS.map((t) => ({ value: t.value, label: t.label })),
                ]}
              />
              {fieldErrors.relatedArea ? (
                <p className="mt-1 text-[12px] text-red-800">{fieldErrors.relatedArea}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor={`${formId}-subject`} className="mb-1 block text-[11px] font-semibold text-[#71717a]">
              Subject
            </label>
            <input
              id={`${formId}-subject`}
              type="text"
              maxLength={200}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setFieldErrors((f) => ({ ...f, subject: '' }));
              }}
              placeholder="Briefly describe your request"
              className="tv-input w-full text-[13px]"
              aria-invalid={Boolean(fieldErrors.subject)}
            />
            {fieldErrors.subject ? <p className="mt-1 text-[12px] text-red-800">{fieldErrors.subject}</p> : null}
          </div>

          <div className="mt-4">
            <label htmlFor={`${formId}-message`} className="mb-1 block text-[11px] font-semibold text-[#71717a]">
              Message
            </label>
            <textarea
              id={`${formId}-message`}
              rows={8}
              maxLength={8000}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setFieldErrors((f) => ({ ...f, message: '' }));
              }}
              placeholder="Tell us what happened, what you need help with, or what you'd like us to improve..."
              className="tv-input w-full resize-y text-[13px] leading-relaxed"
              aria-invalid={Boolean(fieldErrors.message)}
            />
            {fieldErrors.message ? <p className="mt-1 text-[12px] text-red-800">{fieldErrors.message}</p> : null}
          </div>

          <div className="mt-4">
            <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Attachments (optional)</span>
            <p className="mb-2 text-[12px] text-[#a1a1aa]">
              JPG, PNG, or WebP · up to {PARTNER_SUPPORT_MAX_ATTACHMENTS} images · 2 MB each
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= PARTNER_SUPPORT_MAX_ATTACHMENTS}
              className="tv-btn-ghost inline-flex h-10 items-center gap-2 px-3 text-[13px] disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" aria-hidden />
              Add images
            </button>
            {attachments.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <li
                    key={a.id}
                    className="relative h-20 w-20 overflow-hidden rounded-lg ring-1 ring-[#e5e7eb]"
                  >
                    <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove ${a.file.name}`}
                      onClick={() => removeAttachment(a.id)}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-900 ring-1 ring-red-200/80" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="tv-btn-primary inline-flex h-11 min-w-[9.5rem] items-center justify-center px-5 text-[13px] disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  );
}
