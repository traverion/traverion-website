import { useCallback, useId, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import CommunicationAttachmentsField, {
  commAttachmentsBlocking,
  type CommAttachmentItem,
} from '../../components/CommunicationAttachmentsField';
import PartnerSelect from '../../components/supplier/PartnerSelect';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import type { CommUploadSession } from '../../data/supabase-communication-uploads';
import { submitPartnerSupportRequest } from '../../data/supabase-partner-support';
import {
  PARTNER_SUPPORT_RELATED_AREAS,
  PARTNER_SUPPORT_REQUEST_TYPES,
  isPartnerSupportRelatedArea,
  isPartnerSupportRequestType,
  type PartnerSupportRelatedArea,
  type PartnerSupportRequestType,
} from '../../lib/partner-support';

function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ps-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PartnerSupportPage() {
  const formId = useId();
  const [requestType, setRequestType] = useState<PartnerSupportRequestType | ''>('');
  const [relatedArea, setRelatedArea] = useState<PartnerSupportRelatedArea | ''>('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<CommAttachmentItem[]>([]);
  const [uploadSession, setUploadSession] = useState<CommUploadSession | null>(null);
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
      for (const a of prev) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      return [];
    });
    setUploadSession(null);
    setClientRequestId(newClientRequestId());
    setFieldErrors({});
    setError(null);
  }, []);

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
    if (commAttachmentsBlocking(attachments)) {
      next.attachments = 'Wait for uploads to finish, or remove failed files.';
    }
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
        uploadSession: attachments.length ? uploadSession : null,
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
        <SupplierPageHero title="Support" sansTitle />
        <div className="mx-auto w-full max-w-[32rem]">
          <div className="rounded-[12px] border border-[#e5e7eb] bg-white px-5 py-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#ecfdf5] text-[#047857]">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 text-[15px] font-semibold tracking-tight text-[#18181b]">Request sent</p>
            <p className="mt-1.5 text-[13px] text-[#52525b]">We’ll reply by email with a confirmation.</p>
            {successRef !== '—' ? (
              <p className="mt-2 text-[12px] font-medium text-[#71717a]">
                Reference: <span className="tabular-nums text-[#18181b]">{successRef}</span>
              </p>
            ) : null}
            <button
              type="button"
              className="tv-btn-primary mt-5 inline-flex h-9 items-center justify-center px-4 text-[13px]"
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
      <SupplierPageHero title="Support" sansTitle description="Send a request to Traverion." />

      <form
        id={formId}
        onSubmit={(e) => void onSubmit(e)}
        className="mx-auto w-full max-w-[32rem] space-y-3"
        noValidate
      >
        <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="mt-3">
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
              placeholder="Brief summary"
              className="tv-input h-10 w-full text-[13px]"
              aria-invalid={Boolean(fieldErrors.subject)}
            />
            {fieldErrors.subject ? <p className="mt-1 text-[12px] text-red-800">{fieldErrors.subject}</p> : null}
          </div>

          <div className="mt-3">
            <label htmlFor={`${formId}-message`} className="mb-1 block text-[11px] font-semibold text-[#71717a]">
              Message
            </label>
            <textarea
              id={`${formId}-message`}
              rows={5}
              maxLength={8000}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setFieldErrors((f) => ({ ...f, message: '' }));
              }}
              placeholder="What do you need help with?"
              className="tv-input min-h-[7.5rem] w-full resize-y text-[13px] leading-relaxed"
              aria-invalid={Boolean(fieldErrors.message)}
            />
            {fieldErrors.message ? <p className="mt-1 text-[12px] text-red-800">{fieldErrors.message}</p> : null}
          </div>

          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-semibold text-[#71717a]">Attachments (optional)</span>
            <CommunicationAttachmentsField
              category="partner_support"
              items={attachments}
              onChange={setAttachments}
              session={uploadSession}
              onSessionChange={setUploadSession}
              disabled={submitting}
            />
            {fieldErrors.attachments ? (
              <p className="mt-1 text-[12px] text-red-800">{fieldErrors.attachments}</p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-900 ring-1 ring-red-200/80" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || commAttachmentsBlocking(attachments)}
            className="tv-btn-primary inline-flex h-10 min-w-[8.5rem] items-center justify-center px-4 text-[13px] disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  );
}
