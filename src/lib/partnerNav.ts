/**
 * Partner information architecture — single source for sidebar / More sheet labels.
 *
 * Hierarchy (Phase 1 premium sidebar):
 *   Create · Overview · Tours & Activities · Stays · Business · Help/Settings
 *
 * Listing type (tour / stay) is chosen at Create. Mobile bottom tabs stay in
 * PARTNER_PRIMARY_NAV_SECTION_IDS.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  MessageSquare,
  MapPin,
  Car,
  Star,
  Percent,
  TrendingUp,
  Wallet,
  Building2,
  Settings,
  Info,
  BedDouble,
  Compass,
  Hotel,
  KeyRound,
} from 'lucide-react';

export type PartnerNavSectionId =
  | 'dashboard'
  | 'create'
  | 'availability'
  | 'bookings'
  | 'reservations'
  | 'stay-calendar'
  | 'rental-calendar'
  | 'inbox'
  | 'listings'
  | 'pickup'
  | 'reviews'
  | 'discounts'
  | 'performance'
  | 'earnings'
  | 'verification'
  | 'business-profile'
  | 'account-settings'
  | 'onboarding'
  | 'change-password'
  | 'support'
  | 'help';

export type PartnerNavItem = {
  id: PartnerNavSectionId;
  label: string;
  icon: LucideIcon;
};

/** @deprecated Prefer real PartnerNavItem — Stay Calendar is live. */
export type PartnerNavSoonItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  comingSoon: true;
};

export type PartnerSidebarChild = PartnerNavItem | PartnerNavSoonItem;

export function isPartnerNavSoonItem(item: PartnerSidebarChild): item is PartnerNavSoonItem {
  return 'comingSoon' in item && item.comingSoon === true;
}

export type PartnerNavGroup = {
  id: string;
  label: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  items: PartnerNavItem[];
};

export type PartnerSidebarLeaf = {
  kind: 'item';
  id: PartnerNavSectionId;
  label: string;
  icon: LucideIcon;
};

export type PartnerSidebarGroup = {
  kind: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: PartnerSidebarChild[];
};

export type PartnerSidebarAction = {
  kind: 'action';
  id: 'create';
  label: string;
};

export type PartnerSidebarSection = {
  kind: 'section';
  id: string;
  label: string;
};

export type PartnerSidebarEntry =
  | PartnerSidebarLeaf
  | PartnerSidebarGroup
  | PartnerSidebarAction
  | PartnerSidebarSection;

export const PARTNER_NAV_HOME: PartnerNavItem = {
  id: 'dashboard',
  label: 'Home',
  icon: LayoutDashboard,
};

export const PARTNER_NAV_CALENDAR: PartnerNavItem = {
  id: 'availability',
  label: 'Departures & availability',
  icon: CalendarDays,
};

/** Tour ops under Tours & Activities. */
export const PARTNER_NAV_TOURS_CHILDREN: PartnerSidebarChild[] = [
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  PARTNER_NAV_CALENDAR,
  { id: 'pickup', label: 'Pickups', icon: Car },
];

/** @deprecated Use PARTNER_NAV_TOURS_CHILDREN */
export const PARTNER_NAV_BOOKINGS_CHILDREN: PartnerNavItem[] = [
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'pickup', label: 'Pickups', icon: Car },
];

/** Stay ops under Stays. */
export const PARTNER_NAV_STAYS_CHILDREN: PartnerSidebarChild[] = [
  { id: 'reservations', label: 'Reservations', icon: BedDouble },
  { id: 'stay-calendar', label: 'Stay Calendar', icon: CalendarDays },
];

/** Rental ops under Rentals (availability only — checkout still closed). */
export const PARTNER_NAV_RENTALS_CHILDREN: PartnerSidebarChild[] = [
  { id: 'rental-calendar', label: 'Rental calendar', icon: KeyRound },
];

/** @deprecated Use PARTNER_NAV_STAYS_CHILDREN navigable items */
export const PARTNER_NAV_RESERVATIONS_CHILDREN: PartnerNavItem[] = [
  { id: 'reservations', label: 'Reservations', icon: BedDouble },
];

/**
 * Desktop sidebar — Create, Overview, product ops groups, Business, footer for Help/Settings.
 */
export const PARTNER_SIDEBAR_PRIMARY: PartnerSidebarEntry[] = [
  { kind: 'section', id: 'overview', label: 'Overview' },
  { kind: 'item', id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { kind: 'item', id: 'listings', label: 'Listings', icon: MapPin },
  { kind: 'item', id: 'inbox', label: 'Inbox', icon: MessageSquare },
  {
    kind: 'group',
    id: 'tours',
    label: 'Tours & Activities',
    icon: Compass,
    defaultOpen: true,
    children: PARTNER_NAV_TOURS_CHILDREN,
  },
  {
    kind: 'group',
    id: 'stays',
    label: 'Stays',
    icon: Hotel,
    defaultOpen: true,
    children: PARTNER_NAV_STAYS_CHILDREN,
  },
  {
    kind: 'group',
    id: 'rentals',
    label: 'Rentals',
    icon: KeyRound,
    defaultOpen: true,
    children: PARTNER_NAV_RENTALS_CHILDREN,
  },
  { kind: 'section', id: 'business', label: 'Business' },
  { kind: 'item', id: 'earnings', label: 'Income & Payouts', icon: Wallet },
  { kind: 'item', id: 'performance', label: 'Analytics', icon: TrendingUp },
  { kind: 'item', id: 'reviews', label: 'Reviews', icon: Star },
  { kind: 'item', id: 'discounts', label: 'Offers', icon: Percent },
];

export const PARTNER_SIDEBAR_FOOTER: PartnerNavItem[] = [
  { id: 'support', label: 'Support', icon: Info },
  { id: 'business-profile', label: 'Settings', icon: Settings },
];

/** Shared Offers leaf — also pinned in PARTNER_SIDEBAR_PRIMARY for discoverability. */
export const PARTNER_NAV_OFFERS: PartnerNavItem = {
  id: 'discounts',
  label: 'Offers',
  icon: Percent,
};

/** Canonical screen titles — keep heroes / document.title aligned with nav labels. */
export const PARTNER_SECTION_TITLES: Record<PartnerNavSectionId, string> = {
  dashboard: 'Home',
  create: 'Create listing',
  listings: 'Listings',
  bookings: 'Bookings',
  pickup: 'Pickups',
  availability: 'Departures & Availability',
  reservations: 'Reservations',
  'stay-calendar': 'Stay Calendar',
  'rental-calendar': 'Rental calendar',
  inbox: 'Inbox',
  reviews: 'Reviews',
  discounts: 'Offers',
  earnings: 'Income & Payouts',
  verification: 'Verification',
  performance: 'Analytics',
  support: 'Support',
  help: 'Support',
  'business-profile': 'Settings',
  'account-settings': 'Account',
  onboarding: 'Get ready',
  'change-password': 'Password',
};

export function partnerSectionTitle(sectionId: string): string {
  return PARTNER_SECTION_TITLES[sectionId as PartnerNavSectionId] ?? 'Partner';
}

export function partnerSidebarGroupContaining(
  sectionId: string,
  entries: readonly PartnerSidebarEntry[] = PARTNER_SIDEBAR_PRIMARY
): PartnerSidebarGroup | null {
  for (const entry of entries) {
    if (
      entry.kind === 'group' &&
      entry.children.some((c) => !isPartnerNavSoonItem(c) && c.id === sectionId)
    ) {
      return entry;
    }
  }
  return null;
}

export function partnerSidebarDefaultChild(group: PartnerSidebarGroup): PartnerNavSectionId {
  const first = group.children.find((c) => !isPartnerNavSoonItem(c));
  return (first as PartnerNavItem | undefined)?.id ?? 'dashboard';
}

export function partnerSidebarNavigableIds(
  entries: readonly PartnerSidebarEntry[] = PARTNER_SIDEBAR_PRIMARY
): PartnerNavSectionId[] {
  const ids: PartnerNavSectionId[] = [];
  for (const entry of entries) {
    if (entry.kind === 'item') ids.push(entry.id);
    if (entry.kind === 'action') ids.push(entry.id);
    if (entry.kind === 'group') {
      for (const child of entry.children) {
        if (!isPartnerNavSoonItem(child)) ids.push(child.id);
      }
    }
  }
  return ids;
}

/** localStorage key for expanded sidebar groups (comma-separated ids). */
export const PARTNER_NAV_OPEN_GROUPS_KEY = 'traverion_partner_nav_groups_v1';

export function readPartnerNavOpenGroups(
  entries: readonly PartnerSidebarEntry[] = PARTNER_SIDEBAR_PRIMARY
): string[] {
  const known = new Set(
    entries.filter((e): e is PartnerSidebarGroup => e.kind === 'group').map((e) => e.id)
  );
  try {
    const raw = localStorage.getItem(PARTNER_NAV_OPEN_GROUPS_KEY);
    if (raw != null) {
      const parsed = raw
        .split(',')
        .map((s) => s.trim())
        .filter((id) => known.has(id));
      return parsed;
    }
  } catch {
    /* private mode */
  }
  return entries
    .filter((e): e is PartnerSidebarGroup => e.kind === 'group' && e.defaultOpen !== false)
    .map((e) => e.id);
}

export function writePartnerNavOpenGroups(ids: readonly string[]): void {
  try {
    localStorage.setItem(PARTNER_NAV_OPEN_GROUPS_KEY, ids.join(','));
  } catch {
    /* ignore */
  }
}

/**
 * Mobile More sheet — mirrors sidebar product groups without duplicating bottom tabs.
 */
export const PARTNER_MORE_GROUPS: PartnerNavGroup[] = [
  {
    id: 'operate',
    label: 'Overview',
    items: [{ id: 'inbox', label: 'Inbox', icon: MessageSquare }],
  },
  {
    id: 'tours',
    label: 'Tours & Activities',
    items: [{ id: 'pickup', label: 'Pickups', icon: Car }],
  },
  {
    id: 'stays',
    label: 'Stays',
    items: [
      ...PARTNER_NAV_RESERVATIONS_CHILDREN,
      { id: 'stay-calendar', label: 'Stay Calendar', icon: CalendarDays },
    ],
  },
  {
    id: 'rentals',
    label: 'Rentals',
    items: [{ id: 'rental-calendar', label: 'Rental calendar', icon: KeyRound }],
  },
  {
    id: 'business',
    label: 'Business',
    items: [
      { id: 'earnings', label: 'Income & Payouts', icon: Wallet },
      { id: 'performance', label: 'Analytics', icon: TrendingUp },
      { id: 'reviews', label: 'Reviews', icon: Star },
      PARTNER_NAV_OFFERS,
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'support', label: 'Support', icon: Info },
      { id: 'business-profile', label: 'Settings', icon: Settings },
      { id: 'account-settings', label: 'Account settings', icon: Settings },
      { id: 'onboarding', label: 'Get ready', icon: Building2 },
    ],
  },
];

/** @deprecated Use PARTNER_NAV_HOME */
export const PARTNER_NAV_TODAY = PARTNER_NAV_HOME;

/** @deprecated Use PARTNER_NAV_BOOKINGS_CHILDREN */
export const PARTNER_NAV_MANAGE = PARTNER_NAV_BOOKINGS_CHILDREN;

/** @deprecated */
export const PARTNER_NAV_LISTINGS: PartnerNavItem[] = [
  { id: 'listings', label: 'Listings', icon: MapPin },
  PARTNER_NAV_CALENDAR,
];

/** @deprecated */
export const PARTNER_NAV_GROW: PartnerNavItem[] = [
  { id: 'performance', label: 'Analytics', icon: TrendingUp },
  { id: 'reviews', label: 'Reviews', icon: Star },
  PARTNER_NAV_OFFERS,
];

/** @deprecated */
export const PARTNER_NAV_FINANCE: PartnerNavItem[] = [
  { id: 'earnings', label: 'Income & Payouts', icon: Wallet },
];

/** @deprecated */
export const PARTNER_NAV_BUSINESS: PartnerNavItem[] = [
  { id: 'business-profile', label: 'Settings', icon: Building2 },
  { id: 'account-settings', label: 'Account settings', icon: Settings },
];

/** @deprecated Prefer PARTNER_SIDEBAR_PRIMARY */
export const PARTNER_SIDEBAR_GROUPS: PartnerNavGroup[] = PARTNER_MORE_GROUPS;
