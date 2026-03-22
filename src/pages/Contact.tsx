import { useState, useEffect } from 'react';
import { Mail, Phone, Send, CheckCircle } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import LuxuryInput from '../components/ui/LuxuryInput';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const goPackages = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('packages');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.beach}
        overlay="slateSoft"
        eyebrow="Support"
        title="Contact us"
        subtitle="Bookings, trips, and general questions only. Affiliate and creator applications each have their own page in the footer."
      />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div className="pt-2">
            <div className="inline-block px-3 py-1.5 bg-finland/10 text-finland rounded-full text-sm font-semibold mb-4">
              Get in touch
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">We are here to help</h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-xl mb-4">
              Tell us what you need — tours, packages, or account help — and we will follow up. Supplier
              access: supplier portal. Partnerships: <strong className="text-gray-800">Become an affiliate</strong>.
              Media / creators: <strong className="text-gray-800">Become a content creator</strong>.
            </p>
            <p className="text-gray-600 leading-relaxed max-w-xl">
              Browse{' '}
              <a href="/packages" onClick={goPackages} className="text-finland font-medium hover:underline">
                tours &amp; activities
              </a>{' '}
              anytime.
            </p>
          </div>

          <LuxuryCard variant="elevated" className="p-6 sm:p-8">
            {isSubmitted ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-green-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-600">Thank you. We will get back to you soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <LuxuryInput
                  type="text"
                  placeholder="Your Name"
                  value={formData.name}
                  onChange={handleInputChange}
                  name="name"
                  required
                />
                <LuxuryInput
                  type="email"
                  placeholder="Email Address"
                  value={formData.email}
                  onChange={handleInputChange}
                  name="email"
                  required
                />
                <LuxuryInput
                  type="tel"
                  placeholder="Phone number (optional)"
                  value={formData.phone}
                  onChange={handleInputChange}
                  name="phone"
                />
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
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
          </LuxuryCard>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-finland/10 text-finland flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Phone</p>
              <a href="tel:+358458803060" className="text-gray-900 font-medium hover:text-finland">
                +358 45 8803060
              </a>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-finland/10 text-finland flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Email</p>
              <a href="mailto:info@traverion.com" className="text-gray-900 font-medium hover:text-finland">
                info@traverion.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
