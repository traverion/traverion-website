import { useState } from 'react';
import { Mail, Phone, MapPin, Clock, Send, MessageCircle, Globe, User, Calendar, CheckCircle } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import LuxuryInput from '../components/ui/LuxuryInput';
import { submitContactInquiry, ContactInquiry } from '../lib/supabase';

export default function Contact() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    tourInterest: '',
    travelDate: '',
    groupSize: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Prepare contact inquiry data for Supabase
      const inquiryData: Omit<ContactInquiry, 'id' | 'created_at' | 'updated_at'> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        subject: formData.subject,
        message: formData.message,
        inquiry_type: formData.tourInterest ? 'booking' : 'general',
        status: 'new'
      };

      // Submit to Supabase
      const result = await submitContactInquiry(inquiryData);

      if (result.success) {
        setIsSubmitted(true);
        // Reset form after successful submission
        setTimeout(() => {
          setIsSubmitted(false);
          setFormData({
            name: '',
            email: '',
            phone: '',
            subject: '',
            message: '',
            tourInterest: '',
            travelDate: '',
            groupSize: ''
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-white pt-20">
      {/* Hero Section */}
      <section className="relative py-24 bg-gradient-to-br from-sky-50 via-white to-blue-50 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230ea5e9' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-sky-100 text-sky-600 rounded-full text-sm font-semibold mb-6 animate-fade-in-up">
              ✨ Get In Touch
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-bold text-gray-900 mb-6 animate-fade-in-up stagger-1">
              Contact <span className="gradient-text">Us</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed animate-fade-in-up stagger-2">
              Ready to start your extraordinary journey? We're here to help you plan the perfect luxury travel experience.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Information */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            <LuxuryCard variant="elevated" className="p-8 text-center">
              <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-heading font-bold text-gray-900 mb-2">Phone</h3>
              <p className="text-gray-600 mb-2">+358 40 123 4567</p>
              <p className="text-sm text-gray-500">Mon-Fri 9AM-6PM (EET)</p>
            </LuxuryCard>

            <LuxuryCard variant="elevated" className="p-8 text-center">
              <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-heading font-bold text-gray-900 mb-2">Email</h3>
              <p className="text-gray-600 mb-2">info@traverion.com</p>
              <p className="text-sm text-gray-500">We'll respond within 24 hours</p>
            </LuxuryCard>

            <LuxuryCard variant="elevated" className="p-8 text-center">
              <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-heading font-bold text-gray-900 mb-2">Office</h3>
              <p className="text-gray-600 mb-2">Helsinki, Finland</p>
              <p className="text-sm text-gray-500">By appointment only</p>
            </LuxuryCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div>
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-6">Send us a Message</h2>
              
              {isSubmitted ? (
                <LuxuryCard variant="elevated" className="p-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-xl font-heading font-bold text-gray-900 mb-2">Message Sent!</h3>
                  <p className="text-gray-600">Thank you for contacting us. We'll get back to you soon!</p>
                </LuxuryCard>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LuxuryInput
                      type="tel"
                      placeholder="Phone Number"
                      value={formData.phone}
                      onChange={handleInputChange}
                      name="phone"
                    />
                    <LuxuryInput
                      type="text"
                      placeholder="Subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      name="subject"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select
                      name="tourInterest"
                      value={formData.tourInterest}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    >
                      <option value="">Select Tour Interest</option>
                      <option value="vietnam">Vietnam Tours</option>
                      <option value="thailand">Thailand Tours</option>
                      <option value="cambodia">Cambodia Tours</option>
                      <option value="indochina">Indochina Tours</option>
                      <option value="custom">Custom Tour</option>
                    </select>
                    
                    <LuxuryInput
                      type="date"
                      placeholder="Preferred Travel Date"
                      value={formData.travelDate}
                      onChange={handleInputChange}
                      name="travelDate"
                    />
                  </div>

                  <LuxuryInput
                    type="text"
                    placeholder="Group Size"
                    value={formData.groupSize}
                    onChange={handleInputChange}
                    name="groupSize"
                  />

                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Tell us about your dream trip..."
                    rows={5}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
                    required
                  />

                  <LuxuryButton
                    type="submit"
                    variant="gradient"
                    size="lg"
                    className="w-full group"
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
            </div>

            {/* Additional Info */}
            <div>
              <h2 className="text-3xl font-heading font-bold text-gray-900 mb-6">Why Choose Us?</h2>
              
              <div className="space-y-6">
                <LuxuryCard variant="glass" className="p-6">
                  <div className="flex items-start">
                    <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                      <Globe className="w-6 h-6 text-sky-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-semibold text-gray-900 mb-2">Expert Local Knowledge</h3>
                      <p className="text-gray-600">Our team has extensive experience in Southeast Asia, ensuring authentic and memorable experiences.</p>
                    </div>
                  </div>
                </LuxuryCard>

                <LuxuryCard variant="glass" className="p-6">
                  <div className="flex items-start">
                    <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                      <User className="w-6 h-6 text-sky-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-semibold text-gray-900 mb-2">Personalized Service</h3>
                      <p className="text-gray-600">Every tour is tailored to your preferences, ensuring a unique and personal experience.</p>
                    </div>
                  </div>
                </LuxuryCard>

                <LuxuryCard variant="glass" className="p-6">
                  <div className="flex items-start">
                    <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                      <Clock className="w-6 h-6 text-sky-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-semibold text-gray-900 mb-2">24/7 Support</h3>
                      <p className="text-gray-600">We're here to help you throughout your journey, from planning to completion.</p>
                    </div>
                  </div>
                </LuxuryCard>
              </div>

              <div className="mt-8 p-6 bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl">
                <h3 className="text-xl font-heading font-bold text-gray-900 mb-4">Quick Response Guarantee</h3>
                <p className="text-gray-600 mb-4">We understand that planning your dream trip is important. That's why we guarantee a response within 24 hours.</p>
                <div className="flex items-center text-sky-600">
                  <Calendar className="w-5 h-5 mr-2" />
                  <span className="font-semibold">Response Time: &lt; 24 hours</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}