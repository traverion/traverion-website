/**
 * Lucide icons for Stay amenity labels — semantic matches only.
 * Shared by consumer PDP and supplier creator (via re-export where needed).
 */
import {
  Baby,
  Bath,
  Bus,
  Car,
  Flame,
  Flower2,
  Heater,
  Home,
  KeyRound,
  MapPin,
  Mountain,
  ParkingCircle,
  Shirt,
  Sofa,
  Sparkles,
  Trees,
  Tv,
  Users,
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

const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  'Peaceful surroundings': Trees,
  'Private sauna': Flame,
  'Central location': MapPin,
  'Family-friendly': Users,
  'Scenic views': Mountain,
  'Spacious interiors': Home,
  'Outdoor hot tub': Waves,
  'Convenient transport': Bus,
};

export function stayHighlightLucideIcon(label: string): LucideIcon | null {
  return HIGHLIGHT_ICONS[label] ?? Sparkles;
}
