import { useState, useEffect } from 'react';
import { Send, CheckCircle } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryInput from '../components/ui/LuxuryInput';
import LegalPageShell from '../components/LegalPageShell';
import { submitContactInquiry, ContactInquiry } from '../data/supabase-contact';
import { required, validateEmail, maxLength } from '../lib/validation';
import { CONTACT_PREFILL_KEY } from '../lib/contactPrefill';
import { buildInquiryEmailSubject } from '../lib/contactEmailSubject';

type ContactProps = {
  onNavigate?: (page: string) => void;
};

export default function Contact({ onNavigate }: ContactProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
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
    if (!required(formData.message).valid) {
      alert('Please enter your message.');
      return;
    }
    if (!maxLength(formData.message, 5000).valid) {
      alert('Message is too long (max 5000 characters).');
      return;
    }
    setIsSubmitting(true);
    try {
      const emailSubject = buildInquiryEmailSubject('general', '');

      const inquiryData: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        subject: emailSubject,
        message: formData.message,
        inquiry_type: 'general',
        status: 'new'
      };

      const result = await submitContactInquiry(inquiryData);

      if (result.success) {
        setIsSubmitted(true);
        setTimeout(() => {
          setIsSubmitted(false);
          setFormData({
            name: '',
            email: '',
            phone: '',
            message: ''
          });
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to submit inquiry');
      }
    } catch (error) {
      console.error('Contact form submission error:', error);
      alert('Failed to submit inquiry. Please try again or contact us directly.');
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
        <a href="/packages" onClick={goPackages} className="text-finland font-medium hover:underline">
          tours &amp; activities
        </a>{' '}
        anytime. Email{' '}
        <a href="mailto:info@traverion.com" className="text-finland font-medium hover:underline">
          info@traverion.com
        </a>
        .
      </p>

      {isSubmitted ? (
        <div>
          <CheckCircle className="w-8 h-8 text-finland mb-3" />
          <h2>Message sent</h2>
          <p>Thank you. We will get back to you soon.</p>
        </div>
      ) : (
              <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                <LuxuryInput
                  type="text"
                  placeholder="Your Name"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                />
                <LuxuryInput
                  type="email"
                  placeholder="Email Address"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  required
                />
                <LuxuryInput
                  type="tel"
                  placeholder="Phone number (optional)"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                />
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Your message..."
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-finland focus:border-transparent transition-all resize-none"
                  required
                />
                <LuxuryButton
                  type="submit"
                  variant="gradient"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 w-5 h-5" />
                      Send Message
                    </>
                  )}
                </LuxuryButton>
              </form>
            )}
    </LegalPageShell>
  );
}
