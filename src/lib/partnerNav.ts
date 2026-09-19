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
  items: PartnerNavItem[];
};

/** High-frequency operating surfaces — always visible in desktop sidebar. */
export const PARTNER_NAV_OPERATE: PartnerNavItem[] = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'availability', label: 'Calendar', icon: CalendarDays },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'listings', label: 'Listings', icon: MapPin },
];

/** Day-of logistics and guest feedback — explicit homes, not buried. */
export const PARTNER_NAV_OPERATIONS: PartnerNavItem[] = [
  { id: 'pickup', label: 'Pickup', icon: Car },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'discounts', label: 'Offers', icon: Percent },
];

/** Honest performance + money — trust surfaces. */
export const PARTNER_NAV_INSIGHTS: PartnerNavItem[] = [
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'earnings', label: 'Money', icon: Wallet },
];

/** Business identity vs personal account — never mix with ops. */
export const PARTNER_NAV_BUSINESS: PartnerNavItem[] = [
  { id: 'business-profile', label: 'Business profile', icon: Building2 },
  { id: 'account-settings', label: 'Account settings', icon: Settings },
];

export const PARTNER_SIDEBAR_GROUPS: PartnerNavGroup[] = [
  { id: 'operate', label: 'Operate', items: PARTNER_NAV_OPERATE },
  { id: 'operations', label: 'Operations', items: PARTNER_NAV_OPERATIONS },
  { id: 'insights', label: 'Insights', items: PARTNER_NAV_INSIGHTS },
  { id: 'business', label: 'Business', items: PARTNER_NAV_BUSINESS },
];

/** Mobile More sheet — ops first (incl. Inbox), then insights, then business (account separate). */
export const PARTNER_MORE_GROUPS: PartnerNavGroup[] = [
  {
    id: 'operate-extra',
    label: 'Operate',
    items: [{ id: 'inbox', label: 'Inbox', icon: MessageSquare }],
  },
  { id: 'operations', label: 'Operations', items: PARTNER_NAV_OPERATIONS },
  { id: 'insights', label: 'Insights', items: PARTNER_NAV_INSIGHTS.filter((i) => i.id !== 'earnings') },
  { id: 'business', label: 'Business', items: PARTNER_NAV_BUSINESS },
];
