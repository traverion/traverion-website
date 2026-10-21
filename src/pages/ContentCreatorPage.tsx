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

type ContentCreatorPageProps = {
  onNavigate?: (page: string) => void;
};

type FieldKey =
  | 'name'
  | 'email'
  | 'country'
  | 'platform'
  | 'profiles'
  | 'niche'
  | 'style'
  | 'collab'
  | 'form'
  | 'attachments';

export default function ContentCreatorPage({ onNavigate }: ContentCreatorPageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    country: '',
    platform: '',
    profiles: '',
    followers: '',
    niche: '',
    style: '',
    collab: '',
    portfolio: '',
    message: CONTACT_PRESETS.creator.message,
  });
  const [attachments, setAttachments] = useState<CommAttachmentItem[]>([]);
  const [uploadSession, setUploadSession] = useState<CommUploadSession | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  useEffect(() => {
    const pre = takeContactPrefill();
    if (!pre || pre.inquiry_type !== 'content_creator') return;
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
    if (!required(formData.name).valid) next.name = 'Enter your name or creator name.';
    const emailCheck = validateEmail(formData.email);
    if (!emailCheck.valid) next.email = emailCheck.message ?? 'Enter a valid email.';
    if (!required(formData.country).valid) next.country = 'Enter your country.';
    if (!required(formData.platform).valid) next.platform = 'Enter your primary platform.';
    if (!required(formData.profiles).valid) next.profiles = 'Add at least one profile link.';
    if (!required(formData.niche).valid) next.niche = 'Describe your content niche.';
    if (!required(formData.style).valid) next.style = 'Describe your typical content style.';
    if (!required(formData.collab).valid) next.collab = 'Share your collaboration interests.';
    else if (!maxLength(formData.collab, 8000).valid) next.collab = 'Message is too long.';
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
      const extra =
        formData.message.trim() && formData.message.trim() !== CONTACT_PRESETS.creator.message
          ? `\n\nAdditional notes:\n${formData.message.trim()}`
          : '';
      const result = await submitContactInquiry(
        {
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: `${formData.name.trim()} — creator application`,
          message: `${formData.collab.trim()}${extra}`,
          inquiry_type: 'content_creator',
          structured_data: {
            country: formData.country.trim(),
            primary_platform: formData.platform.trim(),
            profile_links: formData.profiles.trim(),
            follower_count: formData.followers.trim() || null,
            content_niche: formData.niche.trim(),
            content_style: formData.style.trim(),
            collaboration_interests: formData.collab.trim(),
            portfolio_or_media_kit: formData.portfolio.trim() || null,
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
          platform: '',
          profiles: '',
          followers: '',
          niche: '',
          style: '',
          collab: '',
          portfolio: '',
          message: CONTACT_PRESETS.creator.message,
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
      title="Become a content creator"
      subtitle="Pitch a collaboration — press trips, sponsored content, or co-created guides — separate from customer support."
      onNavigate={onNavigate}
    >
      {successRef ? (
        <div className="space-y-4 max-w-lg">
          <NoticeCallout title={PARTNERSHIP_FORM_SUCCESS_HEADING} tone="success">
            Thank you for your interest in Traverion. Your application has been submitted successfully
            (reference <strong className="tabular-nums">{successRef}</strong>). We&apos;ve sent a
            confirmation to your email. This confirms receipt and review — not an accepted collaboration.
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
              This is a pitch form only — there is no creator portal or guaranteed campaign yet. Business
              registration is not required.
            </p>
          </div>
          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4 max-w-lg">
            {fieldErrors.form ? (
              <NoticeCallout title="Could not submit application" tone="danger">
                {fieldErrors.form}
              </NoticeCallout>
            ) : null}

            <div>
              <label htmlFor="cc-name" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Full name or creator name
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
              />
              {fieldErrors.name ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.name}
                </p>
              ) : null}
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
              />
              {fieldErrors.email ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-country" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Country
              </label>
              <input
                id="cc-country"
                type="text"
                value={formData.country}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, country: e.target.value }));
                  clearField('country');
                }}
                className="tv-input"
                autoComplete="country-name"
              />
              {fieldErrors.country ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.country}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-platform" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Primary social media platform
              </label>
              <input
                id="cc-platform"
                type="text"
                value={formData.platform}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, platform: e.target.value }));
                  clearField('platform');
                }}
                className="tv-input"
                placeholder="Instagram, YouTube, TikTok, blog…"
              />
              {fieldErrors.platform ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.platform}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-profiles" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Social media profile links
              </label>
              <textarea
                id="cc-profiles"
                rows={3}
                value={formData.profiles}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, profiles: e.target.value }));
                  clearField('profiles');
                }}
                className="tv-input resize-y"
                placeholder="One URL per line"
              />
              {fieldErrors.profiles ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.profiles}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-followers" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Approximate follower count <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="cc-followers"
                type="text"
                value={formData.followers}
                onChange={(e) => setFormData((p) => ({ ...p, followers: e.target.value }))}
                className="tv-input"
              />
            </div>

            <div>
              <label htmlFor="cc-niche" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Content niche or category
              </label>
              <input
                id="cc-niche"
                type="text"
                value={formData.niche}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, niche: e.target.value }));
                  clearField('niche');
                }}
                className="tv-input"
              />
              {fieldErrors.niche ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.niche}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-style" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Typical content style
              </label>
              <textarea
                id="cc-style"
                rows={3}
                value={formData.style}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, style: e.target.value }));
                  clearField('style');
                }}
                className="tv-input resize-y"
              />
              {fieldErrors.style ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.style}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-collab" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Collaboration interests
              </label>
              <textarea
                id="cc-collab"
                rows={4}
                value={formData.collab}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, collab: e.target.value }));
                  clearField('collab');
                }}
                className="tv-input resize-y"
              />
              {fieldErrors.collab ? (
                <p className="mt-1.5 text-sm text-red-800" role="alert">
                  {fieldErrors.collab}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="cc-portfolio" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Portfolio or media kit <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="cc-portfolio"
                type="url"
                value={formData.portfolio}
                onChange={(e) => setFormData((p) => ({ ...p, portfolio: e.target.value }))}
                className="tv-input"
              />
            </div>

            <div>
              <label htmlFor="cc-message" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
                Additional message <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                id="cc-message"
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
                category="content_creator"
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
