import { ArrowLeft, Cookie, Settings, Shield, Mail, Phone } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';

type CookiesProps = {
  onNavigate?: (page: string) => void;
};

export default function Cookies({ onNavigate }: CookiesProps) {
  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.laos}
        eyebrow="Transparency"
        title="Cookies & marketing preferences"
        subtitle="What cookies we use, why they matter, and how you can control analytics and marketing signals when you browse Traverion."
        overlay="finland"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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

        <p className="text-gray-600 text-sm mb-6">Last updated: {new Date().toLocaleDateString()}</p>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 space-y-8 border border-gray-100">
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
              <Cookie className="w-6 h-6 text-sky-600" />
              Third-party tools & retention
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                Some cookies are set by trusted partners (for example analytics or embedded maps). Those
                providers have their own privacy notices. We aim to use only services that meet reasonable
                security and compliance standards.
              </p>
              <p>
                Retention periods vary: session cookies expire when you close the browser; persistent
                cookies may last from a few days to several months depending on their purpose. Marketing
                preferences you save with us are kept until you withdraw consent or close your account,
                subject to legal retention needs.
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
                <p>
                  <strong>Email:</strong>{' '}
                  <a href="mailto:info@traverion.com" className="text-sky-700 hover:underline">
                    info@traverion.com
                  </a>
                </p>
                <p>
                  <strong>Phone:</strong>{' '}
                  <a href="tel:+358458803060" className="text-sky-700 hover:underline">
                    +358 45 8803060
                  </a>
                </p>
                <p><strong>Address:</strong> TRAVERION Travel Agency, Finland</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

