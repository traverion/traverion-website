import { useState } from 'react';
import { ArrowLeft, Cookie, Settings, Shield, Mail, Phone } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

export default function Cookies() {
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
            <Cookie className="w-8 h-8 text-sky-600" />
            <h1 className="text-4xl font-bold text-gray-900">Cookie Policy</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Cookie className="w-6 h-6 text-sky-600" />
              What Are Cookies?
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>Cookies are small text files that are placed on your computer or mobile device when you visit our website. They help us provide you with a better experience by remembering your preferences and enabling certain functionality.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="w-6 h-6 text-sky-600" />
              How We Use Cookies
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>We use cookies for the following purposes:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Essential Cookies:</strong> Required for basic website functionality</li>
                <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our site</li>
                <li><strong>Preference Cookies:</strong> Remember your language and region settings</li>
                <li><strong>Marketing Cookies:</strong> Used to deliver relevant advertisements</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-600" />
              Managing Cookies
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>You can control and manage cookies in several ways:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Use your browser settings to block or delete cookies</li>
                <li>Use our cookie preference center (if available)</li>
                <li>Opt out of specific cookie categories</li>
              </ul>
              <p className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <strong>Note:</strong> Blocking certain cookies may affect the functionality of our website.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="w-6 h-6 text-sky-600" />
              Contact Us
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>If you have any questions about our use of cookies, please contact us:</p>
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

