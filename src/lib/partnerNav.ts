/**
 * Partner information architecture — single source for sidebar / More sheet labels.
 * Mobile bottom tabs stay in PARTNER_PRIMARY_NAV_SECTION_IDS (5-slot thumb bar).
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
} from 'lucide-react';

export type PartnerNavSectionId =
  | 'dashboard'
  | 'availability'
  | 'bookings'
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
  | 'change-password';

export type PartnerNavItem = {
  id: PartnerNavSectionId;
  label: string;
  icon: LucideIcon;
};

export type PartnerNavGroup = {
  id: string;
  label: string;
  /** When true, group starts expanded and can collapse on desktop. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  items: PartnerNavItem[];
};

/** Home — always first, not buried in a group. */
export const PARTNER_NAV_TODAY: PartnerNavItem = {
  id: 'dashboard',
  label: 'Today',
  icon: LayoutDashboard,
};

/** Day-of ops: who is coming, what they said, pickup. */
export const PARTNER_NAV_MANAGE: PartnerNavItem[] = [
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'pickup', label: 'Pickup', icon: Car },
];

/** Inventory + availability. */
export const PARTNER_NAV_LISTINGS: PartnerNavItem[] = [
  { id: 'listings', label: 'Listings', icon: MapPin },
  { id: 'availability', label: 'Calendar', icon: CalendarDays },
];

/** Growth surfaces. */
export const PARTNER_NAV_GROW: PartnerNavItem[] = [
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'discounts', label: 'Offers', icon: Percent },
];

/** Money — one clear home. */
export const PARTNER_NAV_FINANCE: PartnerNavItem[] = [
  { id: 'earnings', label: 'Money', icon: Wallet },
];

/** Business identity vs personal account — never mix with ops. */
export const PARTNER_NAV_BUSINESS: PartnerNavItem[] = [
  { id: 'business-profile', label: 'Business profile', icon: Building2 },
  { id: 'account-settings', label: 'Account settings', icon: Settings },
];

/** @deprecated Prefer PARTNER_SIDEBAR_GROUPS — kept for any stray imports. */
export const PARTNER_NAV_OPERATE: PartnerNavItem[] = [
  PARTNER_NAV_TODAY,
  ...PARTNER_NAV_LISTINGS,
  PARTNER_NAV_MANAGE[0]!,
  PARTNER_NAV_MANAGE[1]!,
];

/** @deprecated Prefer PARTNER_SIDEBAR_GROUPS */
export const PARTNER_NAV_OPERATIONS: PartnerNavItem[] = [
  PARTNER_NAV_MANAGE[2]!,
  PARTNER_NAV_GROW[1]!,
  PARTNER_NAV_GROW[2]!,
];

/** @deprecated Prefer PARTNER_SIDEBAR_GROUPS */
export const PARTNER_NAV_INSIGHTS: PartnerNavItem[] = [
  PARTNER_NAV_GROW[0]!,
  PARTNER_NAV_FINANCE[0]!,
];

/**
 * Desktop sidebar — GYG-style expandable groups, Traverion IA.
 * Today is pinned above groups so Home is never hidden.
 */
export const PARTNER_SIDEBAR_GROUPS: PartnerNavGroup[] = [
  {
    id: 'manage',
    label: 'Manage',
    collapsible: true,
    defaultOpen: true,
    items: PARTNER_NAV_MANAGE,
  },
  {
    id: 'listings',
    label: 'Listings',
    collapsible: true,
    defaultOpen: true,
    items: PARTNER_NAV_LISTINGS,
  },
  {
    id: 'grow',
    label: 'Grow',
    collapsible: true,
    defaultOpen: true,
    items: PARTNER_NAV_GROW,
  },
  {
    id: 'finance',
    label: 'Finance',
    collapsible: true,
    defaultOpen: true,
    items: PARTNER_NAV_FINANCE,
  },
  {
    id: 'business',
    label: 'Business',
    collapsible: true,
    defaultOpen: true,
    items: PARTNER_NAV_BUSINESS,
  },
];

/** Mobile More sheet — ops first (incl. Inbox), then growth, then business. */
export const PARTNER_MORE_GROUPS: PartnerNavGroup[] = [
  {
    id: 'manage',
    label: 'Manage',
    items: PARTNER_NAV_MANAGE,
  },
  {
    id: 'listings',
    label: 'Listings',
    items: PARTNER_NAV_LISTINGS,
  },
  {
    id: 'grow',
    label: 'Grow',
    items: PARTNER_NAV_GROW,
  },
  {
    id: 'finance',
    label: 'Finance',
    items: PARTNER_NAV_FINANCE,
  },
  {
    id: 'business',
    label: 'Business',
    items: PARTNER_NAV_BUSINESS,
  },
];
