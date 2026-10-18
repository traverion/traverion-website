import {
  BedDouble,
  BedSingle,
  Building2,
  Camera,
  Car,
  Castle,
  ConciergeBell,
  DoorOpen,
  Flame,
  Home,
  KeyRound,
  Lock,
  LockKeyhole,
  Mountain,
  Sofa,
  Sparkles,
  TreePine,
  Tv,
  UserRound,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wind,
  type LucideIcon,
} from 'lucide-react';

const ICON = { strokeWidth: 1.75 } as const;

function glyph(Icon: LucideIcon) {
  return <Icon {...ICON} />;
}

const PROPERTY_ICONS: Record<string, LucideIcon> = {
  Apartment: Building2,
  House: Home,
  Cabin: TreePine,
  Room: DoorOpen,
  Cottage: Home,
  Villa: Castle,
  Chalet: Mountain,
  Other: Sparkles,
};

export function stayPropertyIcon(type: string) {
  const Icon = PROPERTY_ICONS[type] ?? Sparkles;
  return glyph(Icon);
}

const ARRIVAL_ICONS: Record<string, LucideIcon> = {
  self: KeyRound,
  host: UserRound,
  lockbox: Lock,
  smart_lock: LockKeyhole,
  reception: ConciergeBell,
  other: DoorOpen,
};

export function stayArrivalIcon(method: string) {
  const Icon = ARRIVAL_ICONS[method] ?? DoorOpen;
  return glyph(Icon);
}

const AMENITY_ICONS: Record<string, LucideIcon> = {
  Wifi,
  Heating: Flame,
  'Air conditioning': Wind,
  Kitchen: UtensilsCrossed,
  TV: Tv,
  Sauna: Flame,
  'Hot tub': Waves,
  Pool: Waves,
  'Free parking': Car,
  'Paid parking': Car,
  'EV charging': Car,
};

export function stayAmenityIcon(label: string) {
  const Icon = AMENITY_ICONS[label];
  return Icon ? glyph(Icon) : null;
}

const BED_ICONS: Record<string, LucideIcon> = {
  single: BedSingle,
  double: BedDouble,
  queen: BedDouble,
  king: BedDouble,
  sofa: Sofa,
  bunk: BedSingle,
};

export function stayBedIcon(kind: string) {
  const Icon = BED_ICONS[kind] ?? BedDouble;
  return glyph(Icon);
}

export function staySafetyIcon() {
  return glyph(Camera);
}
