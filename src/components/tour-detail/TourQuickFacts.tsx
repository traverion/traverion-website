import { CalendarCheck, CarFront, Clock, Languages, MapPin, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import type { ListingBookingOption } from '../../types/listingExtras';
import { tourQuickFacts } from '../../lib/tour-quick-facts';
import ListingPdpQuickFacts from '../ListingPdpQuickFacts';

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
  const facts = tourQuickFacts(tour, option).map((fact) => {
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
    return { label, value, icon: Icon };
  });
  return <ListingPdpQuickFacts facts={facts} />;
}
