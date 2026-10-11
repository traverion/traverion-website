/**
 * Partner information architecture — single source for sidebar / More sheet labels.
 *
 * Listing type (tour / stay) is chosen at Create, not as the permanent sidebar axis.
 * Labels, order, and submenu children live here so they can change without hunting JSX.
 * Mobile bottom tabs stay in PARTNER_PRIMARY_NAV_SECTION_IDS.
 *
 * Groups: daily operations (schedule/guests) sit above business configuration (money/growth/settings).
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
  Plus,
} from 'lucide-react';

export type PartnerNavSectionId =
  | 'dashboard'
  | 'create'
  | 'availability'
  | 'bookings'
  | 'reservations'
  | 'inbox'
  | 'listings'
  | 'pickup'
  | 'reviews'
  | 'discounts'
  | 'performance'
  | 'earnings'
  | 'business-profile'
  | 'account-settings'
  | 'onboarding'
  | 'change-password'
  | 'help';

export type PartnerNavItem = {
  id: PartnerNavSectionId;
  label: string;
  icon: LucideIcon;
};

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
  children: PartnerNavItem[];
};

export type PartnerSidebarAction = {
  kind: 'action';
  id: 'create';
  label: string;
};

export type PartnerSidebarEntry = PartnerSidebarLeaf | PartnerSidebarGroup | PartnerSidebarAction;

export const PARTNER_NAV_HOME: PartnerNavItem = {
  id: 'dashboard',
  label: 'Home',
  icon: LayoutDashboard,
};

export const PARTNER_NAV_CALENDAR: PartnerNavItem = {
  id: 'availability',
  label: 'Calendar',
  icon: CalendarDays,
};

/** Tour-day ops nested under Bookings (Calendar is a primary leaf — not nested). */
export const PARTNER_NAV_BOOKINGS_CHILDREN: PartnerNavItem[] = [
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'pickup', label: 'Pickups', icon: Car },
];

/**
 * Reservations is stay-night inventory. There is one real management surface
 * (the bookings page locked to stays) — not a second "reservation management" app.
 */
export const PARTNER_NAV_RESERVATIONS_CHILDREN: PartnerNavItem[] = [
  { id: 'reservations', label: 'Reservations', icon: BedDouble },
];

/**
 * Desktop sidebar — Create + daily ops, then guest/comms, then business, footer for account.
 * Calendar is a leaf (matches mobile primary) so operators do not hunt under Bookings.
 */
export const PARTNER_SIDEBAR_PRIMARY: PartnerSidebarEntry[] = [
  { kind: 'action', id: 'create', label: 'Create listing' },
  { kind: 'item', id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { kind: 'item', id: 'listings', label: 'Listings', icon: MapPin },
  {
    kind: 'group',
    id: 'bookings',
    label: 'Bookings',
    icon: Calendar,
    children: PARTNER_NAV_BOOKINGS_CHILDREN,
  },
  { kind: 'item', id: 'availability', label: 'Calendar', icon: CalendarDays },
  { kind: 'item', id: 'reservations', label: 'Reservations', icon: BedDouble },
  { kind: 'item', id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { kind: 'item', id: 'reviews', label: 'Reviews', icon: Star },
  { kind: 'item', id: 'discounts', label: 'Offers', icon: Percent },
  { kind: 'item', id: 'earnings', label: 'Income', icon: Wallet },
  { kind: 'item', id: 'performance', label: 'Analytics', icon: TrendingUp },
];

export const PARTNER_SIDEBAR_FOOTER: PartnerNavItem[] = [
  { id: 'help', label: 'Help', icon: Info },
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
  availability: 'Calendar',
  reservations: 'Reservations',
  inbox: 'Inbox',
  reviews: 'Reviews',
  discounts: 'Offers',
  earnings: 'Income',
  performance: 'Analytics',
  help: 'Help',
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
    if (entry.kind === 'group' && entry.children.some((c) => c.id === sectionId)) return entry;
  }
  return null;
}

export function partnerSidebarDefaultChild(group: PartnerSidebarGroup): PartnerNavSectionId {
  return group.children[0]!.id;
}

/**
 * Mobile More sheet — daily operate vs business vs account.
 * Omits bottom-primary destinations (Home, Bookings, Listings, Calendar) to avoid duplicates.
 */
export const PARTNER_MORE_GROUPS: PartnerNavGroup[] = [
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { id: 'create', label: 'Create listing', icon: Plus },
      { id: 'pickup', label: 'Pickups', icon: Car },
      ...PARTNER_NAV_RESERVATIONS_CHILDREN,
      { id: 'inbox', label: 'Inbox', icon: MessageSquare },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    items: [
      { id: 'reviews', label: 'Reviews', icon: Star },
      { id: 'earnings', label: 'Income', icon: Wallet },
      { id: 'performance', label: 'Analytics', icon: TrendingUp },
      PARTNER_NAV_OFFERS,
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'help', label: 'Help', icon: Info },
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
  { id: 'earnings', label: 'Income', icon: Wallet },
];

/** @deprecated */
export const PARTNER_NAV_BUSINESS: PartnerNavItem[] = [
  { id: 'business-profile', label: 'Settings', icon: Building2 },
  { id: 'account-settings', label: 'Account settings', icon: Settings },
];

/** @deprecated Prefer PARTNER_SIDEBAR_PRIMARY */
export const PARTNER_SIDEBAR_GROUPS: PartnerNavGroup[] = PARTNER_MORE_GROUPS;
