import type { MouseEvent } from 'react';
import { ArrowLeft, FileText, Scale, AlertTriangle, Mail, Shield, Globe } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';

type TermsProps = {
  onNavigate?: (page: string) => void;
};

export default function Terms({ onNavigate }: TermsProps) {
  const goPrivacy = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('privacy');
    }
  };

  const goContact = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('contact');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.banner}
        overlay="slate"
        eyebrow="Legal"
        title="General Terms and Conditions"
        subtitle="Terms of Service for using Traverion — bookings, accounts, liability, and your relationship with us and our suppliers."
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

        <div>
          <header className="mb-8">
            <p className="text-gray-600 text-sm">
              Last updated: {new Date().toLocaleDateString()}
            </p>
            <p className="text-gray-600 mt-3 text-sm sm:text-base">
              These Terms work together with our{' '}
              <a
                href="/privacy"
                onClick={goPrivacy}
                className="text-sky-700 hover:underline font-medium"
              >
                Privacy Policy
              </a>
              . Please read both.
            </p>
          </header>

          {/* Content */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 space-y-8 border border-gray-100">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-sky-600 shrink-0" />
              Acceptance of Terms
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>By accessing and using TRAVERION's services, you accept and agree to be bound by the terms and provision of this agreement.</p>
              <p>If you do not agree to abide by the above, please do not use this service.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-sky-600" />
              Description of Services
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                TRAVERION provides an online platform to discover, compare, and book travel-related products and services (including packages, tours, and related arrangements) offered by us and, where applicable, third-party suppliers. We act as an intermediary or organiser as stated in your booking confirmation and applicable law.
              </p>
              <p>
                <strong>Important:</strong> Final travel services are often delivered by airlines, hotels, transport operators, and other partners. Their terms, conditions, and operational rules (e.g. baggage, check-in, health or entry requirements) apply in addition to these Terms. You are responsible for verifying passport, visa, insurance, and health requirements before travel.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-sky-600 shrink-0" />
              Who you contract with
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                Depending on the product, your agreement for the travel service may be with TRAVERION and/or with independent third-party suppliers (e.g. carriers, hotels, local operators). Your booking confirmation and any supplier terms provided at checkout or on vouchers describe who is responsible for performing the service.
              </p>
              <p>
                Descriptions, images, and inclusions shown on our platform are based on information we or suppliers provide. While we aim for accuracy, suppliers may change schedules, routes, or inclusions. Where something is safety- or regulation-related, follow instructions from the supplier on the day of travel.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-600 shrink-0" />
              Accounts, accuracy &amp; use of the website
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                You must provide accurate, current information when creating an account or making a booking. You are responsible for safeguarding your login credentials and for all activity under your account. Notify us promptly if you suspect unauthorised use.
              </p>
              <p>
                The website is intended for personal, non-commercial use unless we agree otherwise in writing. You may not use automated means (e.g. bots, scrapers, or crawlers) to extract data or content without our prior consent, resell bookings for profit, or misuse the platform in any way that could harm other users, suppliers, or our systems.
              </p>
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
                <li>Prices are subject to change until payment is confirmed as stated at checkout</li>
                <li>Payment terms, deposits, and instalments vary by package and destination</li>
                <li>Cancellation, change, and refund rules are those in your booking confirmation and any supplier-specific terms</li>
                <li>Travel insurance is strongly recommended for all bookings</li>
              </ul>
              <p>
                <strong>Payments &amp; refunds:</strong> Charges are processed as described at the time of purchase. Refunds or credits, if any, follow the cancellation policy applicable to your booking and may be subject to fees imposed by suppliers or payment processors. Authorised payment methods and any third-party payment terms shown at checkout also apply.
              </p>
              <p>
                <strong>Changes &amp; cancellations:</strong> Cancellations and changes (such as dates or participant names) must be requested through the channels we specify—typically your account, booking confirmation, or{' '}
                <a href="/contact" onClick={goContact} className="text-sky-700 hover:underline font-medium">
                  contact
                </a>{' '}
                page—within any deadline in your confirmation or supplier terms. What counts as “in time” is usually based on when we receive your request, not when you send an informal message elsewhere. Suppliers may contact you about last-minute changes using the email or phone number you provided.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-sky-600 shrink-0" />
              Reviews &amp; other content you submit
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                If you post reviews, photos, or other material (&quot;user content&quot;), you are responsible for its accuracy and for having the rights to share it (including consent from people who appear in images where required). Content must not be misleading, defamatory, infringe others&apos; rights, or contain unlawful material.
              </p>
              <p>
                You grant TRAVERION a non-exclusive licence to host, display, and use that content in connection with our services and marketing, until you delete it or close your account where our systems allow. We may remove content that breaches these Terms or applicable law.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-600 shrink-0" />
              Personal data
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                We process personal data as described in our{' '}
                <a href="/privacy" onClick={goPrivacy} className="text-sky-700 hover:underline font-medium">
                  Privacy Policy
                </a>
                , including legal bases, retention, and your rights under applicable law (such as the GDPR where it applies).
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-sky-600" />
              Intellectual Property
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                Content on this site (including text, graphics, logos, and software) is owned by TRAVERION or its licensors and is protected by applicable intellectual property laws. You may not copy, modify, distribute, or exploit our content without prior written permission, except for personal, non-commercial use as allowed by law.
              </p>
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
              <Globe className="w-6 h-6 text-sky-600 shrink-0" />
              Online dispute resolution (EU)
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                The European Commission provides a platform for online dispute resolution (ODR):{' '}
                <a
                  href="https://ec.europa.eu/consumers/odr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-700 hover:underline break-all"
                >
                  https://ec.europa.eu/consumers/odr
                </a>
                . You may use it if you are a consumer resident in the EU. We are not obliged to use any particular alternative dispute resolution body; nothing in this section limits mandatory rights you have under consumer law.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-sky-600 shrink-0" />
              Governing law &amp; disputes
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                These Terms are governed by the laws of Finland, without regard to conflict-of-law principles. Any disputes shall be resolved in the courts of Finland, unless mandatory consumer protection rules in your country of residence grant you non-waivable rights to bring proceedings elsewhere.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-sky-600 shrink-0" />
              Assignment, termination &amp; severability
            </h2>
            <div className="space-y-4 text-gray-700">
              <p>
                You may not transfer your rights or obligations under these Terms to someone else without our consent, except where the law allows (for example certain compensation claims).
              </p>
              <p>
                You may close your account or stop using the site at any time, subject to completing or paying for bookings already made. We may suspend or end access if these Terms are breached or if required for legal, security, or operational reasons, without prejudice to rights and duties from confirmed bookings.
              </p>
              <p>
                If any part of these Terms is held invalid, the rest remains in force and the invalid part should be interpreted as closely as possible to the original intent, or replaced by applicable law where needed.
              </p>
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
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
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
    </div>
  );
}
