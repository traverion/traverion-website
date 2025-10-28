import { useState } from 'react';
import { ArrowLeft, Shield, Lock, Eye, Database, Mail, Phone } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

export default function Privacy() {
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
            <Shield className="w-8 h-8 text-sky-600" />
            <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-6 h-6 text-sky-600" />
              Information We Collect
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>We collect information you provide directly to us, such as when you:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Book travel packages or request quotes</li>
                <li>Create an account or contact us</li>
                <li>Subscribe to our newsletter</li>
                <li>Participate in surveys or promotions</li>
              </ul>
              <p>This may include your name, email address, phone number, travel preferences, and payment information.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Eye className="w-6 h-6 text-sky-600" />
              How We Use Your Information
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Provide personalized travel recommendations</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Database className="w-6 h-6 text-sky-600" />
              Information Sharing
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>We do not sell, trade, or otherwise transfer your personal information to third parties except:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>With your consent</li>
                <li>To trusted partners who assist in operating our website</li>
                <li>When required by law or to protect our rights</li>
                <li>In connection with a business transfer or acquisition</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-600" />
              Data Security
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
              <p>However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="w-6 h-6 text-sky-600" />
              Contact Us
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>If you have any questions about this Privacy Policy, please contact us:</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p><strong>Email:</strong> privacy@traverion.com</p>
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
