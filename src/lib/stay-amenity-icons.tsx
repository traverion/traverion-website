/**
 * Lucide icons for Stay amenity labels — semantic matches only.
 * Shared by consumer PDP and supplier creator (via re-export where needed).
 */
import {
  Baby,
  Bath,
  Car,
  Flame,
  Flower2,
  Heater,
  KeyRound,
  ParkingCircle,
  Shirt,
  Sofa,
  Sparkles,
  Trees,
  Tv,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wind,
  type LucideIcon,
} from 'lucide-react';

const AMENITY_ICONS: Record<string, LucideIcon> = {
  Wifi,
  Heating: Flame,
  'Air conditioning': Wind,
  Kitchen: UtensilsCrossed,
  Towels: Shirt,
  'Bed linen': Sofa,
  'Hot water': Bath,
  TV: Tv,
  Washer: Shirt,
  Dryer: Shirt,
  'Hair dryer': Wind,
  Workspace: Sofa,
  Fireplace: Flame,
  Sauna: Heater,
  'Hot tub': Waves,
  Bathtub: Bath,
  Pool: Waves,
  Terrace: Trees,
  Balcony: Trees,
  Garden: Flower2,
  'Outdoor furniture': Sofa,
  Barbecue: Flame,
  'Free parking': Car,
  'Paid parking': ParkingCircle,
  'EV charging': Car,
  'Self check-in': KeyRound,
  Elevator: Sparkles,
  Crib: Baby,
  'High chair': Baby,
};

export function stayAmenityLucideIcon(label: string): LucideIcon | null {
  return AMENITY_ICONS[label] ?? null;
}
