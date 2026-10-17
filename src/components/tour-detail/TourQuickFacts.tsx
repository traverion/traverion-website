import { CalendarCheck, CarFront, Clock, Languages, MapPin, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

const ICONS: Record<string, LucideIcon> = {
  Duration: Clock,
  'Group size': Users,
  Language: Languages,
  Start: MapPin,
  Transport: CarFront,
  Cancellation: CalendarCheck,
};

export default function TourQuickFacts({ tour, option }: Props) {
  const facts = tourQuickFacts(tour, option);
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
      {facts.map((fact) => {
        const Icon = ICONS[fact.label] ?? Clock;
        return (
          <div key={fact.label} className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f4f5f7] text-[#073b83]">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <dd className="text-sm font-semibold leading-snug text-ink">{fact.value}</dd>
              <dt className="mt-0.5 text-xs text-ink-muted">{fact.label}</dt>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
