import { ArrowLeft, Building2, Mail } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';
import type { MouseEvent } from 'react';

type LegalNoticeProps = {
  onNavigate?: (page: string) => void;
};

const LAST_UPDATED = '2026-03-26';

export default function LegalNotice({ onNavigate }: LegalNoticeProps) {
  const goTerms = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('terms');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.banner}
        overlay="slate"
        eyebrow="Legal"
        title="Legal notice"
        subtitle="Operator identification, contact details for official correspondence, and links to our policies."
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

        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-8 text-gray-700">
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-finland shrink-0" />
                Website operator
              </h2>
              <p className="leading-relaxed">
                This website and the Traverion travel platform are operated by{' '}
                <strong>TRAVERION</strong> (Traverion Travel Agency), based in Finland. We arrange and
                facilitate bookings for tours, activities, and related travel services in line with our{' '}
                <a href="/terms" onClick={goTerms} className="text-finland font-medium hover:underline">
                  General Terms and Conditions
                </a>
                .
              </p>
              <p className="mt-4 leading-relaxed">
                Specific company registration details (legal entity name, registered address, and official
                registration identifiers used in your jurisdiction) can be provided on request for contractual or regulatory purposes. For general
                enquiries, use the contact details below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Contact for legal & official matters</h2>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-5 space-y-3">
                <p className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-finland shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-gray-900">Email:</strong>{' '}
                    <a href="mailto:info@traverion.com" className="text-finland hover:underline">
                      info@traverion.com
                    </a>
                  </span>
                </p>
                <p>
                  <strong className="text-gray-900">Postal address:</strong> TRAVERION Travel Agency,
                  Finland
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Consumer information</h2>
              <p className="leading-relaxed mb-3">
                The European Commission provides a platform for online dispute resolution (ODR):{' '}
                <a
                  href="https://ec.europa.eu/consumers/odr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-finland hover:underline break-all"
                >
                  https://ec.europa.eu/consumers/odr
                </a>
                . Participation in a specific dispute resolution body is subject to applicable law and our
                operational setup; your statutory rights as a consumer are not limited by this notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">Related documents</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>
                  <a href="/terms" onClick={goTerms} className="text-finland hover:underline">
                    General Terms and Conditions
                  </a>
                </li>
                <li>
                  <a
                    href="/privacy"
                    onClick={(e) => {
                      if (onNavigate) {
                        e.preventDefault();
                        onNavigate('privacy');
                      }
                    }}
                    className="text-finland hover:underline"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/cookies"
                    onClick={(e) => {
                      if (onNavigate) {
                        e.preventDefault();
                        onNavigate('cookies');
                      }
                    }}
                    className="text-finland hover:underline"
                  >
                    Cookies and marketing preferences
                  </a>
                </li>
              </ul>
            </section>

            <p className="text-sm text-gray-500 pt-4 border-t border-gray-100">
              Last updated: {LAST_UPDATED}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
