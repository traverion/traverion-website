import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';

/** Route kept for old links; Traverion is not publishing editorial stories yet. */
export default function Blog() {
  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.beach}
        overlay="slateSoft"
        eyebrow="Traverion"
        title="Stories coming later"
        subtitle="We are not publishing travel articles yet. Browse live experiences instead."
      />
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 text-center">
        <p className="text-gray-600 leading-relaxed">
          Destination guides will return when we have real operator stories worth sharing. Until then, the
          marketplace is the product.
        </p>
        <a
          href="/packages"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-finland px-6 py-3 text-sm font-semibold text-white hover:bg-finland-dark"
        >
          Browse experiences
        </a>
      </div>
    </div>
  );
}
