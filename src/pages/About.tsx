import { ArrowLeft, Heart, Compass, Users } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';

type AboutProps = {
  onNavigate?: (page: string) => void;
};

export default function About({ onNavigate }: AboutProps) {
  const goContact = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('contact');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.thailand}
        overlay="slateSoft"
        eyebrow="Company"
        title="About Traverion"
        subtitle="A Finland-rooted team building a clearer, kinder way to book tours and activities online — for travelers and for local operators who deserve a global stage."
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

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6 text-gray-700">
          <p className="text-lg leading-relaxed">
            Traverion is a tours and activities platform where travelers can discover and book experiences
            worldwide, and where local providers can list and manage their offerings with tools designed
            for real-world operations — not just a pretty listing page.
          </p>
          <p className="leading-relaxed">
            We are originally built in Finland, and that Nordic mindset shapes how we operate: clear
            communication, honest pricing, and high quality standards. Our mission is to help people find
            the best tours and holiday trips with confidence, while helping local operators reach global
            travelers fairly and sustainably.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <Heart className="w-8 h-8 text-finland mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Trust</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Straightforward descriptions, visible policies, and support that answers when plans change.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <Compass className="w-8 h-8 text-finland mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Authenticity</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              We highlight local expertise and itineraries that respect culture and place.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sm:col-span-1 col-span-full">
            <Users className="w-8 h-8 text-finland mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Care</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              From first search to confirmation, we want every step to feel calm and well explained.
            </p>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-xl border border-gray-100 p-6 sm:p-8 text-gray-700 leading-relaxed space-y-4">
          <p>
            We believe travel should feel exciting and simple from the first search to the final booking
            confirmation, with fair cancellation terms and responsive support along the way. Whether you are
            planning a multi-day route through Indochina or a single-day experience in one city, we work to
            surface options that match how you actually like to travel.
          </p>
          <p>
            For questions, partnerships, media, or supplier opportunities, visit our{' '}
            <a href="/contact" onClick={goContact} className="text-finland font-medium hover:underline">
              Contact
            </a>{' '}
            page — we read every message.
          </p>
        </div>
      </div>
    </div>
  );
}
