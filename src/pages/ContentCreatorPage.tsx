import { useState, useEffect } from 'react';
import { Send, CheckCircle } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryInput from '../components/ui/LuxuryInput';
import LegalPageShell from '../components/LegalPageShell';
import { submitContactInquiry, type ContactInquiry } from '../data/supabase-contact';
import { buildInquiryEmailSubject } from '../lib/contactEmailSubject';
import { CONTACT_PRESETS, takeContactPrefill } from '../lib/contactPrefill';
import { required, validateEmail, maxLength } from '../lib/validation';

type ContentCreatorPageProps = {
  onNavigate?: (page: string) => void;
};

export default function ContentCreatorPage({ onNavigate }: ContentCreatorPageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: CONTACT_PRESETS.creator.message,
  });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!required(formData.name).valid) {
      alert('Please enter your name.');
      return;
    }
    const emailCheck = validateEmail(formData.email);
    if (!emailCheck.valid) {
      alert(emailCheck.message ?? 'Please enter a valid email.');
      return;
    }
    if (!required(formData.subject).valid) {
      alert('Please add a short label for your channels or handle (shown in the email subject line).');
      return;
    }
    if (!required(formData.message).valid) {
      alert('Please tell us about your content and collaboration ideas.');
      return;
    }
    if (!maxLength(formData.message, 5000).valid) {
      alert('Message is too long (max 5000 characters).');
      return;
    }

    setIsSubmitting(true);
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
        throw new Error(result.error || 'Failed to submit');
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again in a moment.');
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
          <CheckCircle className="w-8 h-8 text-finland mb-3" />
          <h2>Application received</h2>
          <p>Thank you. We will review your details and reply by email.</p>
        </div>
      ) : (
        <>
          <p>
            For bookings and trip questions, use Contact in the footer — not this form.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                <LuxuryInput
                  type="text"
                  placeholder="Your name"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <LuxuryInput
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  required
                />
                <LuxuryInput
                  type="tel"
                  placeholder="Phone (optional)"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                />
                <LuxuryInput
                  type="text"
                  placeholder="Your main channel, @handle, or portfolio name"
                  value={formData.subject}
                  onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                  required
                />
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Links, audience size, content style, and what you would like to do with Traverion..."
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-finland focus:border-transparent transition-all resize-y text-sm bg-white/80"
                  required
                />
                <LuxuryButton type="submit" variant="gradient" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 w-5 h-5" />
                      Submit application
                    </>
                  )}
                </LuxuryButton>
              </form>
            </>
          )}
    </LegalPageShell>
  );
}
