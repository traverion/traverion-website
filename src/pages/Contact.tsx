import { useState, useEffect } from 'react';
import LegalPageShell from '../components/LegalPageShell';
import { submitContactInquiry, ContactInquiry } from '../data/supabase-contact';
import { required, validateEmail, maxLength } from '../lib/validation';
import { CONTACT_PREFILL_KEY } from '../lib/contactPrefill';
import { buildInquiryEmailSubject } from '../lib/contactEmailSubject';
import { CONTACT_FORM_THANK_YOU } from '../lib/booking-confirmation-copy';

type ContactProps = {
  onNavigate?: (page: string) => void;
};

type FieldKey = 'name' | 'email' | 'message' | 'form';

export default function Contact({ onNavigate }: ContactProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONTACT_PREFILL_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { inquiry_type?: string };
        if (p?.inquiry_type === 'affiliate') {
          onNavigate?.('affiliate');
          return;
        }
        if (p?.inquiry_type === 'content_creator') {
          onNavigate?.('content-creator');
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const topic = new URLSearchParams(window.location.search).get('topic');
    if (topic === 'affiliate') {
      onNavigate?.('affiliate');
      return;
    }
    if (topic === 'creator' || topic === 'content-creator') {
      onNavigate?.('content-creator');
    }
  }, [onNavigate]);

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
    if (!required(formData.message).valid) next.message = 'Enter your message.';
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
        subject: buildInquiryEmailSubject('general', ''),
        message: formData.message,
        inquiry_type: 'general',
        status: 'new',
      };

      const result = await submitContactInquiry(inquiryData);

      if (result.success) {
        setIsSubmitted(true);
        setFormData({ name: '', email: '', phone: '', message: '' });
      } else {
        setFieldErrors({ form: 'Could not send your message. Try again, or email us directly.' });
      }
    } catch {
      setFieldErrors({ form: 'Could not send your message. Try again, or email us directly.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goPackages = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('packages');
    }
  };

  return (
    <LegalPageShell
      title="Contact us"
      subtitle="Bookings, trips, and general questions. Affiliate and creator applications each have their own page in the footer."
      onNavigate={onNavigate}
    >
      <p>
        Browse{' '}
        <a href="/packages" onClick={goPackages}>
          tours &amp; activities
        </a>{' '}
        anytime. Email <a href="mailto:info@traverion.com">info@traverion.com</a>.
      </p>

      {isSubmitted ? (
        <div>
          <h2>Message sent</h2>
          <p>{CONTACT_FORM_THANK_YOU}</p>
        </div>
      ) : (
        <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4 max-w-lg">
          {fieldErrors.form && (
            <p className="text-sm text-red-800" role="alert">
              {fieldErrors.form}
            </p>
          )}
          <div>
            <label htmlFor="contact-name" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
              Name
            </label>
            <input
              id="contact-name"
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
            <label htmlFor="contact-email" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
              Email
            </label>
            <input
              id="contact-email"
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
            <label htmlFor="contact-phone" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
              Phone <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="contact-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
              className="tv-input"
              autoComplete="tel"
            />
          </div>
          <div>
            <label htmlFor="contact-message" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
              Message
            </label>
            <textarea
              id="contact-message"
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
            {isSubmitting ? 'Submitting…' : 'Submit message'}
          </button>
        </form>
      )}
    </LegalPageShell>
  );
}
