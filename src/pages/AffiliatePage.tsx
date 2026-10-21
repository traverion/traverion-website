import { useEffect, useState } from 'react';
import CommunicationAttachmentsField, {
  commAttachmentsBlocking,
  type CommAttachmentItem,
} from '../components/CommunicationAttachmentsField';
import LegalPageShell from '../components/LegalPageShell';
import NoticeCallout from '../components/NoticeCallout';
import type { CommUploadSession } from '../data/supabase-communication-uploads';
import { submitContactInquiry } from '../data/supabase-contact';
import {
  PARTNERSHIP_FORM_SUBMIT_ERROR,
  PARTNERSHIP_FORM_SUCCESS_HEADING,
} from '../lib/booking-confirmation-copy';
import { CONTACT_PRESETS, takeContactPrefill } from '../lib/contactPrefill';
import { maxLength, required, validateEmail } from '../lib/validation';

type AffiliatePageProps = {
  onNavigate?: (page: string) => void;
};

type FieldKey =
  | 'name'
  | 'email'
  | 'country'
  | 'website'
  | 'channel'
  | 'audience'
  | 'promote'
  | 'form'
  | 'attachments';

export default function AffiliatePage({ onNavigate }: AffiliatePageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    country: '',
    website: '',
    channel: '',
    audience: '',
    audienceSize: '',
    promote: '',
    message: CONTACT_PRESETS.affiliate.message,
  });
  const [attachments, setAttachments] = useState<CommAttachmentItem[]>([]);
  const [uploadSession, setUploadSession] = useState<CommUploadSession | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  useEffect(() => {
    const pre = takeContactPrefill();
    if (!pre || pre.inquiry_type !== 'affiliate') return;
    setFormData((prev) => ({
      ...prev,
      message: pre.message?.trim() ? pre.message : prev.message,
    }));
  }, []);

  const clearField = (key: FieldKey) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const next: Partial<Record<FieldKey, string>> = {};
    if (!required(formData.name).valid) next.name = 'Enter your name.';
    const emailCheck = validateEmail(formData.email);
    if (!emailCheck.valid) next.email = emailCheck.message ?? 'Enter a valid email.';
    if (!required(formData.country).valid) next.country = 'Enter your country.';
    if (!required(formData.website).valid) next.website = 'Add a website or social profile link.';
    if (!required(formData.channel).valid) next.channel = 'Describe your primary promotional channel.';
    if (!required(formData.audience).valid) next.audience = 'Describe your audience.';
    if (!required(formData.promote).valid) next.promote = 'Tell us how you plan to promote Traverion.';
    else if (!maxLength(formData.promote, 8000).valid) next.promote = 'Message is too long.';
    if (commAttachmentsBlocking(attachments)) {
      next.attachments = 'Wait for uploads to finish, or remove failed files.';
    }
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const messageParts = [
        formData.promote.trim(),
        formData.message.trim() && formData.message.trim() !== CONTACT_PRESETS.affiliate.message
          ? `\n\nAdditional notes:\n${formData.message.trim()}`
          : '',
      ]
        .filter(Boolean)
        .join('');

      const result = await submitContactInquiry(
        {
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: `${formData.name.trim()} — affiliate application`,
          message: messageParts,
          inquiry_type: 'affiliate',
          structured_data: {
            country: formData.country.trim(),
            website_or_social: formData.website.trim(),
            primary_channel: formData.channel.trim(),
            audience_description: formData.audience.trim(),
            estimated_audience_size: formData.audienceSize.trim() || null,
            promotion_plan: formData.promote.trim(),
          },
        },
        { uploadSession: attachments.length ? uploadSession : null }
      );

      if (result.success) {
        setSuccessRef(result.reference);
        setFormData({
          name: '',
          email: '',
          country: '',
          website: '',
          channel: '',
          audience: '',
          audienceSize: '',
          promote: '',
          message: CONTACT_PRESETS.affiliate.message,
        });
        setAttachments((prev) => {
          for (const a of prev) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
          return [];
        });
        setUploadSession(null);
      } else {
        setFieldErrors({ form: PARTNERSHIP_FORM_SUBMIT_ERROR });
      }
    } catch {
      setFieldErrors({ form: PARTNERSHIP_FORM_SUBMIT_ERROR });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LegalPageShell
      eyebrow="Work with us"
      title="Become an affiliate"
      subtitle="Apply to promote Traverion tours and stays. Approval and tracking links come after review — not automatic payouts."
      onNavigate={onNavigate}
    >
      {successRef ? (
        <div className="space-y-4 max-w-lg">
          <NoticeCallout title={PARTNERSHIP_FORM_SUCCESS_HEADING} tone="success">
            Thank you for your interest in Traverion. Your application has been submitted successfully
            (reference <strong className="tabular-nums">{successRef}</strong>). We&apos;ve sent a
            confirmation to your email. This confirms receipt only — not approval.
          </NoticeCallout>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigate?.('packages')} className="tv-btn-primary">
              Browse tours
            </button>
            <button type="button" onClick={() => onNavigate?.('home')} className="tv-btn-ghost">
              Back to home
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="max-w-lg mb-5 rounded-2xl bg-finland/8 px-3.5 py-2.5 ring-1 ring-finland/15">
            <p className="text-sm text-ink leading-relaxed">
              This is an application form only — there is no affiliate dashboard or self-serve tracking yet.
              Individuals are welcome to apply; business registration is not required.
            </p>
          </div>
          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4 max-w-lg">
            {fieldErrors.form ? (
              <NoticeCallout title="Could not submit application" tone="danger">
                {fieldErrors.form}
              </NoticeCallout>
            ) : null}

            {(
              [
                ['name', 'Full name', 'name', 'aff-name'],
                ['email', 'Email', 'email', 'aff-email'],
                ['country', 'Country', 'country-name', 'aff-country'],
                ['website', 'Website or social profile', 'url', 'aff-website'],
                ['channel', 'Primary promotional channel', undefined, 'aff-channel'],
              ] as const
            ).map(([key, label, autoComplete, id]) => (
              <div key={key}>
                <label htmlFor={id} className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                  {label}
                </label>
                <input
                  id={id}
                  type={key === 'email' ? 'email' : key === 'website' ? 'url' : 'text'}
                  value={formData[key]}
                  onChange={(e) => {
                    setFormData((p) => ({ ...p, [key]: e.target.value }));
                    clearField(key);
                  }}
                  className="tv-input"
                  autoComplete={autoComplete}
                  aria-invalid={fieldErrors[key] ? true : undefined}
                />
                {fieldErrors[key] ? (
                  <p className="mt-1.5 text-sm text-red-800" role="alert">
                    {fieldErrors[key]}
                  </p>
                ) : null}
              </div>
            ))}

            <div>
              <label htmlFor="aff-audience" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Audience or website description
              </label>
              <textarea
                id="aff-audience"
                rows={3}
                value={formData.audience}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, audience: e.target.value }));
                  clearField('audience');
                }}
                className="tv-input resize-y"
              />
              {fieldErrors.audience ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.audience}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="aff-size" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Estimated audience size / monthly traffic{' '}
                <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="aff-size"
                type="text"
                value={formData.audienceSize}
                onChange={(e) => setFormData((p) => ({ ...p, audienceSize: e.target.value }))}
                className="tv-input"
              />
            </div>

            <div>
              <label htmlFor="aff-promote" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                How you plan to promote Traverion
              </label>
              <textarea
                id="aff-promote"
                rows={5}
                value={formData.promote}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, promote: e.target.value }));
                  clearField('promote');
                }}
                className="tv-input resize-y"
              />
              {fieldErrors.promote ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.promote}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="aff-message" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Additional message <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                id="aff-message"
                rows={3}
                value={formData.message}
                onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                className="tv-input resize-y"
              />
            </div>

            <div>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Attachments <span className="normal-case tracking-normal">(optional)</span>
              </span>
              <CommunicationAttachmentsField
                category="affiliate"
                items={attachments}
                onChange={setAttachments}
                session={uploadSession}
                onSessionChange={setUploadSession}
                disabled={isSubmitting}
              />
              {fieldErrors.attachments ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.attachments}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || commAttachmentsBlocking(attachments)}
              className="tv-btn-primary lux-tap-target min-h-11 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        </>
      )}
    </LegalPageShell>
  );
}
