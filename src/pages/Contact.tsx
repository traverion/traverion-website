import { useEffect, useRef, useState } from 'react';
import CommunicationAttachmentsField, {
  commAttachmentsBlocking,
  type CommAttachmentItem,
} from '../components/CommunicationAttachmentsField';
import LegalPageShell from '../components/LegalPageShell';
import NoticeCallout from '../components/NoticeCallout';
import type { CommUploadSession } from '../data/supabase-communication-uploads';
import { submitContactInquiry } from '../data/supabase-contact';
import {
  CONTACT_FORM_SUBMIT_ERROR,
  CONTACT_FORM_SUCCESS_HEADING,
} from '../lib/booking-confirmation-copy';
import { CONTACT_PREFILL_KEY } from '../lib/contactPrefill';
import { maxLength, required, validateEmail } from '../lib/validation';

type ContactProps = {
  onNavigate?: (page: string) => void;
};

type FieldKey = 'name' | 'email' | 'subject' | 'message' | 'form' | 'attachments';

type ContactTopic = 'booking' | 'trip' | 'payment' | 'partner' | 'general';

const TOPICS: { id: ContactTopic; label: string; hint: string }[] = [
  { id: 'booking', label: 'Booking help', hint: 'Before you pay or while choosing dates' },
  { id: 'trip', label: 'My trip', hint: 'Confirmed booking, dates, pickup' },
  { id: 'payment', label: 'Payment', hint: 'Stripe charge, receipt, refund status' },
  { id: 'partner', label: 'Partner / supplier', hint: 'Listing, payouts, portal access' },
  { id: 'general', label: 'Something else', hint: 'General questions about Traverion' },
];

export default function Contact({ onNavigate }: ContactProps) {
  const [topic, setTopic] = useState<ContactTopic>('general');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    bookingReference: '',
    message: '',
  });
  const [attachments, setAttachments] = useState<CommAttachmentItem[]>([]);
  const [uploadSession, setUploadSession] = useState<CommUploadSession | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successRef, setSuccessRef] = useState<string | null>(null);
  const successHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!successRef) return;
    successHeadingRef.current?.focus();
  }, [successRef]);

  const readTopicFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const topicParam = params.get('topic');
    if (topicParam === 'affiliate') {
      onNavigate?.('affiliate');
      return;
    }
    if (topicParam === 'creator' || topicParam === 'content-creator') {
      onNavigate?.('content-creator');
      return;
    }
    if (
      topicParam === 'booking' ||
      topicParam === 'trip' ||
      topicParam === 'payment' ||
      topicParam === 'partner' ||
      topicParam === 'general'
    ) {
      setTopic(topicParam);
    }
  };

  const setTopicAndUrl = (next: ContactTopic) => {
    setTopic(next);
    const url = new URL(window.location.href);
    if (next === 'general') url.searchParams.delete('topic');
    else url.searchParams.set('topic', next);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

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
    readTopicFromUrl();
    const onPop = () => readTopicFromUrl();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + popstate only
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
    if (isSubmitting) return;
    const next: Partial<Record<FieldKey, string>> = {};
    if (!required(formData.name).valid) next.name = 'Enter your name.';
    const emailCheck = validateEmail(formData.email);
    if (!emailCheck.valid) next.email = emailCheck.message ?? 'Enter a valid email.';
    if (!required(formData.subject).valid) next.subject = 'Enter a subject.';
    if (!required(formData.message).valid) next.message = 'Enter your message.';
    else if (!maxLength(formData.message, 8000).valid) next.message = 'Message is too long (max 8,000 characters).';
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
      const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? 'Contact';
      const result = await submitContactInquiry(
        {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          subject: formData.subject.trim(),
          message: formData.message.trim(),
          inquiry_type: topic,
          booking_reference: formData.bookingReference.trim() || undefined,
          structured_data: { topic_label: topicLabel },
        },
        { uploadSession: attachments.length ? uploadSession : null }
      );

      if (result.success) {
        setSuccessRef(result.reference);
        setFormData({ name: '', email: '', phone: '', subject: '', bookingReference: '', message: '' });
        setAttachments((prev) => {
          for (const a of prev) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
          return [];
        });
        setUploadSession(null);
      } else {
        setFieldErrors({ form: CONTACT_FORM_SUBMIT_ERROR });
      }
    } catch {
      setFieldErrors({ form: CONTACT_FORM_SUBMIT_ERROR });
    } finally {
      setIsSubmitting(false);
    }
  };

  const showBookingRef = topic === 'booking' || topic === 'trip' || topic === 'payment';

  return (
    <LegalPageShell
      eyebrow="Support"
      title="Contact us"
      subtitle="Bookings, trips, payments, and partner questions. Affiliate and creator applications each have their own page in the footer."
      onNavigate={onNavigate}
    >
      {successRef ? (
        <div className="space-y-4 max-w-lg">
          <div tabIndex={-1} ref={successHeadingRef} className="outline-none">
            <NoticeCallout title={CONTACT_FORM_SUCCESS_HEADING} tone="success">
              Thank you for contacting Traverion. Your reference number is{' '}
              <strong className="tabular-nums">{successRef}</strong>. We&apos;ve received your request
              and sent a confirmation to your email address.
            </NoticeCallout>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSuccessRef(null)} className="tv-btn-secondary">
              Send another message
            </button>
            <button type="button" onClick={() => onNavigate?.('packages')} className="tv-btn-ghost">
              Browse tours
            </button>
            <button type="button" onClick={() => onNavigate?.('home')} className="tv-btn-ghost">
              Back to home
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>
            Browse{' '}
            <a
              href="/packages"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate('packages');
                }
              }}
            >
              tours &amp; activities
            </a>{' '}
            or{' '}
            <a
              href="/stays"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate('stays');
                }
              }}
            >
              stays
            </a>{' '}
            anytime. Email <a href="mailto:info@traverion.com">info@traverion.com</a>. Never send
            passwords or full card numbers here.
          </p>

          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-5 max-w-lg">
            {fieldErrors.form ? (
              <NoticeCallout title="Could not send message" tone="danger">
                {fieldErrors.form}
              </NoticeCallout>
            ) : null}

            <fieldset>
              <legend
                id="contact-topic-legend"
                className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-2"
              >
                What do you need help with?
              </legend>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-1.5"
                role="radiogroup"
                aria-labelledby="contact-topic-legend"
              >
                {TOPICS.map((t) => {
                  const selected = topic === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTopicAndUrl(t.id)}
                      className={`lux-flat rounded-xl px-3 py-2.5 text-left min-h-10 ${
                        selected
                          ? 'bg-finland text-white ring-1 ring-finland'
                          : 'bg-paper-raised text-ink ring-1 ring-black/[0.06] hover:bg-finland/10 hover:text-finland'
                      }`}
                    >
                      <span className="block text-sm font-semibold leading-snug">{t.label}</span>
                      <span
                        className={`block text-[11px] mt-0.5 leading-snug ${selected ? 'text-white/80' : 'text-ink-faint'}`}
                      >
                        {t.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="contact-name" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Full name
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
                required
                aria-invalid={fieldErrors.name ? true : undefined}
              />
              {fieldErrors.name ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.name}
                </p>
              ) : null}
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
                required
                aria-invalid={fieldErrors.email ? true : undefined}
              />
              {fieldErrors.email ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="contact-phone" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Phone <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="contact-phone"
                type="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                className="tv-input"
                autoComplete="tel"
              />
            </div>

            {showBookingRef ? (
              <div>
                <label
                  htmlFor="contact-booking-ref"
                  className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5"
                >
                  Booking reference <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="contact-booking-ref"
                  type="text"
                  value={formData.bookingReference}
                  onChange={(e) => setFormData((p) => ({ ...p, bookingReference: e.target.value }))}
                  className="tv-input"
                  placeholder="e.g. from your confirmation email"
                  maxLength={80}
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="contact-subject" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Subject
              </label>
              <input
                id="contact-subject"
                type="text"
                value={formData.subject}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, subject: e.target.value }));
                  clearField('subject');
                }}
                className="tv-input"
                maxLength={200}
                required
                aria-invalid={fieldErrors.subject ? true : undefined}
              />
              {fieldErrors.subject ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.subject}
                </p>
              ) : null}
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
                required
                aria-invalid={fieldErrors.message ? true : undefined}
                placeholder={
                  topic === 'trip'
                    ? 'Include your booking reference if you have one.'
                    : topic === 'payment'
                      ? 'Include the amount, date, and booking reference if you have them.'
                      : topic === 'partner'
                        ? 'Include your business name and what you need help with in Partner.'
                        : topic === 'booking'
                          ? 'Include the tour or stay name and the dates you are looking at.'
                          : undefined
                }
              />
              <p className="mt-1.5 text-xs text-ink-faint">
                Up to 8,000 characters
                {formData.message.length > 0 ? ` · ${formData.message.length} used` : ''}.
              </p>
              {fieldErrors.message ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.message}
                </p>
              ) : null}
            </div>

            <div>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Attachments <span className="normal-case tracking-normal">(optional)</span>
              </span>
              <CommunicationAttachmentsField
                category="contact"
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
              aria-busy={isSubmitting || undefined}
              className="tv-btn-primary lux-tap-target min-h-11 disabled:opacity-50"
            >
              {isSubmitting ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </>
      )}
    </LegalPageShell>
  );
}
