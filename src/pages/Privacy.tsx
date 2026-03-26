import { ArrowLeft, Shield, Lock, Eye, Database, Mail, UserCheck } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';

type PrivacyProps = {
  onNavigate?: (page: string) => void;
};

const LAST_UPDATED = '2026-03-26';

export default function Privacy({ onNavigate }: PrivacyProps) {
  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.laos}
        overlay="slateSoft"
        eyebrow="Your privacy"
        title="Privacy Policy"
        subtitle="How we collect, use, and protect personal data when you use Traverion — including bookings, accounts, and marketing preferences."
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

        <p className="text-gray-600 text-sm mb-6">Last updated: {LAST_UPDATED}</p>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 space-y-8 border border-gray-100">
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
              <UserCheck className="w-6 h-6 text-sky-600" />
              Your rights (including GDPR)
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                Where the EU General Data Protection Regulation (GDPR) or similar laws apply, you may have the
                right to access, correct, delete, or restrict processing of your personal data, to data
                portability, and to object to certain processing. You may also lodge a complaint with a
                supervisory authority in your country of residence.
              </p>
              <p>
                To exercise these rights, contact us using the details below. We may need to verify your
                identity before fulfilling a request. Our legal bases for processing include performance of
                a contract (e.g. completing a booking), legitimate interests (e.g. fraud prevention and
                analytics), consent where required (e.g. certain marketing cookies), and legal obligation.
              </p>
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
