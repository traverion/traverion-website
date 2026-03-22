import { useState, useEffect } from 'react';
import { ArrowLeft, Send, CheckCircle } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import LuxuryInput from '../components/ui/LuxuryInput';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.beach}
        overlay="finland"
        title="Become a content creator"
        subtitle="Pitch a collaboration — press trips, sponsored content, or co-created guides — on its own form, separate from customer support."
      />

      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LuxuryButton
          variant="outline"
          onClick={() =>
            navigateBackOrFallback(() => {
              onNavigate?.('home');
            })
          }
          className="mb-8"
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          Back
        </LuxuryButton>

        <LuxuryCard variant="elevated" className="p-6 sm:p-8 shadow-lg border border-finland/10">
          {isSubmitted ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Application received</h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                Thank you. We will review your details and reply by email.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Creator application</h2>
              <p className="text-sm text-gray-500 mb-2">
                For bookings and trip questions, use <strong className="text-gray-700">Contact</strong> in
                the footer — not this form.
              </p>
              <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                Emails to our team use the subject line{' '}
                <strong className="text-finland">New Content Creator Application</strong>
                , then your channel label below, and <span className="font-mono text-[11px]">[Traverion]</span>{' '}
                so you can filter them easily.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <LuxuryInput
                  type="text"
                  name="name"
                  placeholder="Your name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
                <LuxuryInput
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                <LuxuryInput
                  type="tel"
                  name="phone"
                  placeholder="Phone (optional)"
                  value={formData.phone}
                  onChange={handleChange}
                />
                <LuxuryInput
                  type="text"
                  name="subject"
                  placeholder="Your main channel, @handle, or portfolio name"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                />
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
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
        </LuxuryCard>
      </div>
    </div>
  );
}
