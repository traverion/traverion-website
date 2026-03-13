import { TourPackage } from '../types/tour';
import { activities } from './activities';
import { tourPackages, getTourById } from './tours';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchAllListings, fetchListingById } from './supabase-listings';

const STORAGE_KEY = 'traverion_supplier_listings';

/** Show seed activities & holiday packages in UI when true (e.g. demo). Default: false = platform mode, supplier-only. */
export const SHOW_SEED_LISTINGS = import.meta.env.VITE_SHOW_SEED_LISTINGS === 'true';

export function getSupplierListings(): TourPackage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setSupplierListings(list: TourPackage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** All listings to show: supplier-created + optionally seed activities + optionally holiday packages. Sync (localStorage only). */
export function getAllListings(options: {
  includeSeed?: boolean;
  includeHolidayPackages?: boolean;
}): TourPackage[] {
  const { includeSeed = SHOW_SEED_LISTINGS, includeHolidayPackages = false } = options;
  const base = [...getSupplierListings()];
  if (includeSeed) base.push(...activities);
  if (includeHolidayPackages) base.push(...tourPackages);
  return base;
}

/** Async: all listings from Supabase (when configured) or localStorage. Use in components that can wait. */
export async function getAllListingsAsync(options: {
  includeSeed?: boolean;
  includeHolidayPackages?: boolean;
}): Promise<TourPackage[]> {
  const { includeSeed = SHOW_SEED_LISTINGS, includeHolidayPackages = false } = options;
  let base: TourPackage[];
  if (isSupabaseConfigured()) {
    base = await fetchAllListings();
  } else {
    base = [...getSupplierListings()];
  }
  if (includeSeed) base = [...base, ...activities];
  if (includeHolidayPackages) base = [...base, ...tourPackages];
  return base;
}

/** Resolve a listing by id: supplier/Supabase first, then seed activities, then holiday packages. Sync (localStorage + seed/tours). */
export function getListingById(id: string): TourPackage | undefined {
  const supplier = getSupplierListings().find(t => t.id === id);
  if (supplier) return supplier;
  const activity = activities.find(t => t.id === id);
  if (activity) return activity;
  return getTourById(id);
}

/** Async: resolve listing by id (checks Supabase when configured, then seed/tours). */
export async function getListingByIdAsync(id: string): Promise<TourPackage | undefined> {
  if (isSupabaseConfigured()) {
    const fromDb = await fetchListingById(id);
    if (fromDb) return fromDb;
  }
  return getListingById(id);
}

/** Parse duration string to sortable minutes: "3 hours" -> 180, "9 Days - 8 Nights" -> 9*24*60. */
export function durationToMinutes(duration: string): number {
  const d = duration.toLowerCase();
  const hoursMatch = d.match(/(\d+)\s*hour/);
  if (hoursMatch) return parseInt(hoursMatch[1], 10) * 60;
  const daysMatch = d.match(/(\d+)\s*day/);
  if (daysMatch) return parseInt(daysMatch[1], 10) * 24 * 60;
  return 0;
}
