import { useState, useEffect } from 'react';
import LegalPageShell from '../components/LegalPageShell';
import { submitContactInquiry, type ContactInquiry } from '../data/supabase-contact';
import { buildInquiryEmailSubject } from '../lib/contactEmailSubject';
import { PARTNERSHIP_FORM_THANK_YOU, PARTNERSHIP_FORM_SUCCESS_HEADING, PARTNERSHIP_FORM_SUBMIT_ERROR } from '../lib/booking-confirmation-copy';
import { CONTACT_PRESETS, takeContactPrefill } from '../lib/contactPrefill';
import { required, validateEmail, maxLength } from '../lib/validation';

type ContentCreatorPageProps = {
  onNavigate?: (page: string) => void;
};

type FieldKey = 'name' | 'email' | 'subject' | 'message' | 'form';

export default function ContentCreatorPage({ onNavigate }: ContentCreatorPageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: CONTACT_PRESETS.creator.message,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const pre = takeContactPrefill();
    if (!pre || pre.inquiry_type !== 'content_creator') return;
    setFormData((prev) => ({
      ...prev,
      subject: pre.subject?.trim() ? pre.subject : prev.subject,
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
    const next: Partial<Record<FieldKey, string>> = {};
    if (!required(formData.name).valid) next.name = 'Enter your name.';
    const emailCheck = validateEmail(formData.email);
    if (!emailCheck.valid) next.email = emailCheck.message ?? 'Enter a valid email.';
    if (!required(formData.subject).valid) {
      next.subject = 'Add a short label for your channels or handle.';
    }
    if (!required(formData.message).valid) next.message = 'Tell us about your content and collaboration ideas.';
    else if (!maxLength(formData.message, 5000).valid) next.message = 'Message is too long (max 5000 characters).';
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const inquiryData: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        subject: buildInquiryEmailSubject('content_creator', formData.subject),
        message: formData.message,
        inquiry_type: 'content_creator',
        status: 'new',
      };

      const result = await submitContactInquiry(inquiryData);
      if (result.success) {
        setIsSubmitted(true);
        setFormData({
          name: '',
          email: '',
          phone: '',
          subject: '',
          message: CONTACT_PRESETS.creator.message,
        });
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
      title="Become a content creator"
      subtitle="Pitch a collaboration — press trips, sponsored content, or co-created guides — separate from customer support."
      onNavigate={onNavigate}
    >
      {isSubmitted ? (
        <div>
          <h2>{PARTNERSHIP_FORM_SUCCESS_HEADING}</h2>
          <p>{PARTNERSHIP_FORM_THANK_YOU}</p>
        </div>
      ) : (
        <>
          <p>For bookings and trip questions, use Contact in the footer — not this form.</p>
          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4 max-w-lg">
            {fieldErrors.form && (
              <p className="text-sm text-red-800" role="alert">
                {fieldErrors.form}
              </p>
            )}
            <div>
              <label htmlFor="cc-name" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Name
              </label>
              <input
                id="cc-name"
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, name: e.target.value }));
                  clearField('name');
                }}
                className="tv-input"
                autoComplete="name"
                aria-invalid={fieldErrors.name ? true : undefined}
              />
              {fieldErrors.name && (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="cc-email" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Email
              </label>
              <input
                id="cc-email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, email: e.target.value }));
                  clearField('email');
                }}
                className="tv-input"
                autoComplete="email"
                aria-invalid={fieldErrors.email ? true : undefined}
              />
              {fieldErrors.email && (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="cc-phone" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Phone <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="cc-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                className="tv-input"
                autoComplete="tel"
              />
            </div>
            <div>
              <label htmlFor="cc-subject" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Channel or handle
              </label>
              <input
                id="cc-subject"
                type="text"
                value={formData.subject}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, subject: e.target.value }));
                  clearField('subject');
                }}
                className="tv-input"
                aria-invalid={fieldErrors.subject ? true : undefined}
              />
              {fieldErrors.subject && (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.subject}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="cc-message" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Collaboration idea
              </label>
              <textarea
                id="cc-message"
                name="message"
                value={formData.message}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, message: e.target.value }));
                  clearField('message');
                }}
                rows={8}
                className="tv-input min-h-[10rem] resize-y py-3"
                aria-invalid={fieldErrors.message ? true : undefined}
              />
              {fieldErrors.message && (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.message}
                </p>
              )}
            </div>
            <button type="submit" disabled={isSubmitting} className="tv-btn-primary disabled:opacity-50">
              {isSubmitting ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        </>
      )}
    </LegalPageShell>
  );
}
