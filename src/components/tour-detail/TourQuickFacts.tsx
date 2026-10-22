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
          <div key={fact.label} className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5F7FA] text-[#0B397E]">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <dd className="text-sm font-bold leading-snug tracking-tight text-[#111827]">{value}</dd>
              <dt className="mt-0.5 text-[11px] font-medium leading-snug text-ink-muted">{label}</dt>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
