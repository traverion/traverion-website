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

function mentionsGuide(tour: TourPackage): boolean {
  return /\bguides?\b/i.test([...(tour.highlights ?? []), ...(tour.includes ?? [])].join(' '));
}

export default function TourQuickFacts({ tour, option }: Props) {
  const facts = tourQuickFacts(tour, option);
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
      {facts.map((fact) => {
        const Icon = ICONS[fact.label] ?? Clock;
        let value = fact.value;
        let label = fact.label;
        if (fact.label === 'Language' && mentionsGuide(tour)) label = 'Guide language';
        if (fact.value === 'Pickup included') label = 'Pickup';
        else if (fact.value === 'Meeting point') label = 'Meeting';
        if (fact.label === 'Cancellation' && /free/i.test(fact.value)) {
          value = 'Free cancellation';
          label = 'Up to 24 hours before';
        }
        return (
          <div key={fact.label} className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F6F8] text-[#0B397E]">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <dd className="text-[15px] font-bold leading-snug text-[#111827]">{value}</dd>
              <dt className="mt-0.5 text-xs text-ink-muted">{label}</dt>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
