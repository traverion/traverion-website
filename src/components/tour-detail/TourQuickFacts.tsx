import type { TourPackage } from '../../types/tour';
import type { ListingBookingOption } from '../../types/listingExtras';
import { tourQuickFacts } from '../../lib/tour-quick-facts';

type Props = {
  tour: TourPackage;
  option?: Pick<
    ListingBookingOption,
    'duration' | 'fulfillment' | 'maxPersons' | 'transportMode' | 'transportOther'
  > | null;
};

export default function TourQuickFacts({ tour, option }: Props) {
  const facts = tourQuickFacts(tour, option);
  if (facts.length === 0) return null;
  return (
    <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{fact.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-ink leading-snug">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
