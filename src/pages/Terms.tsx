import { useState } from 'react';
import { ArrowLeft, FileText, Scale, AlertTriangle, Mail, Phone } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

export default function Terms() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <LuxuryButton 
            variant="outline" 
            onClick={() => window.history.back()}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back
          </LuxuryButton>
          
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-sky-600" />
            <h1 className="text-4xl font-bold text-gray-900">Terms of Service</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-sky-600" />
              Acceptance of Terms
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>By accessing and using TRAVERION's services, you accept and agree to be bound by the terms and provision of this agreement.</p>
              <p>If you do not agree to abide by the above, please do not use this service.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-sky-600" />
              Booking Terms
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>When booking travel packages with TRAVERION:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>All bookings are subject to availability</li>
                <li>Prices are subject to change without notice</li>
                <li>Payment terms vary by package and destination</li>
                <li>Cancellation policies apply as specified in your booking confirmation</li>
                <li>Travel insurance is recommended for all bookings</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-sky-600" />
              Limitation of Liability
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>TRAVERION shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.</p>
              <p>Our total liability to you for any damages shall not exceed the amount paid by you to TRAVERION for the services in question.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-sky-600" />
              Modifications
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>TRAVERION reserves the right to modify these terms at any time. We will notify users of any material changes via email or through our website.</p>
              <p>Your continued use of our services after such modifications constitutes acceptance of the updated terms.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="w-6 h-6 text-sky-600" />
              Contact Information
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>For questions about these Terms of Service, please contact us:</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p><strong>Email:</strong> legal@traverion.com</p>
                <p><strong>Phone:</strong> +358 45 7834 5138</p>
                <p><strong>Address:</strong> TRAVERION Travel Agency, Finland</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
