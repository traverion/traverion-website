import { TourPackage } from '../types/tour';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchAllListings, fetchListingById } from './supabase-listings';
import { filterTravelerCatalog } from '../lib/inventory';

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

/** All listings to show: supplier-created. Seed/brochure catalogs load only via getAllListingsAsync. */
export function getAllListings(options: {
  includeSeed?: boolean;
  includeHolidayPackages?: boolean;
}): TourPackage[] {
  const { includeSeed = SHOW_SEED_LISTINGS, includeHolidayPackages = false } = options;
  const base = [...getSupplierListings()];
  return includeSeed || includeHolidayPackages ? base : filterTravelerCatalog(base);
}

const PUBLISHED_CATALOG_TTL_MS = 45_000;
let publishedCatalogCache: { at: number; data: TourPackage[] } | null = null;
let publishedCatalogInflight: Promise<TourPackage[]> | null = null;

export function peekPublishedListingsCache(): TourPackage[] | null {
  if (!publishedCatalogCache) return null;
  if (Date.now() - publishedCatalogCache.at > PUBLISHED_CATALOG_TTL_MS) return null;
  return publishedCatalogCache.data;
}

export function invalidatePublishedListingsCache() {
  publishedCatalogCache = null;
  publishedCatalogInflight = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('traverion:published-listings-changed', () => {
    invalidatePublishedListingsCache();
  });
}

/** Async: all listings from Supabase (when configured) or localStorage. Use in components that can wait. */
export async function getAllListingsAsync(options: {
  includeSeed?: boolean;
  includeHolidayPackages?: boolean;
}): Promise<TourPackage[]> {
  const { includeSeed = SHOW_SEED_LISTINGS, includeHolidayPackages = false } = options;
  const usePublishedCache = isSupabaseConfigured() && !includeSeed && !includeHolidayPackages;
  if (usePublishedCache) {
    const hit = peekPublishedListingsCache();
    if (hit) return hit;
    if (publishedCatalogInflight) return publishedCatalogInflight;
    publishedCatalogInflight = fetchAllListings()
      .then((data) => {
        const next = filterTravelerCatalog(data);
        publishedCatalogCache = { at: Date.now(), data: next };
        return next;
      })
      .finally(() => {
        publishedCatalogInflight = null;
      });
    return publishedCatalogInflight;
  }
  let base: TourPackage[];
  if (isSupabaseConfigured()) {
    base = await fetchAllListings();
  } else {
    base = [...getSupplierListings()];
  }
  if (includeSeed) {
    const { activities } = await import('./activities');
    base = [...base, ...activities];
  }
  if (includeHolidayPackages) {
    const { tourPackages } = await import('./tours');
    base = [...base, ...tourPackages];
  }
  return includeSeed || includeHolidayPackages ? base : filterTravelerCatalog(base);
}

/** Resolve a listing by id from local supplier storage (not seed/brochure). */
export function getListingById(id: string): TourPackage | undefined {
  return getSupplierListings().find((t) => t.id === id);
}

/** Async: resolve listing by id (Supabase when configured, then local, then seed only if enabled). */
export async function getListingByIdAsync(id: string): Promise<TourPackage | undefined> {
  if (isSupabaseConfigured()) {
    const fromDb = await fetchListingById(id);
    if (fromDb) return fromDb;
  }
  const local = getListingById(id);
  if (local) return local;
  if (!SHOW_SEED_LISTINGS) return undefined;
  const { activities } = await import('./activities');
  const activity = activities.find((t) => t.id === id);
  if (activity) return activity;
  const { getTourById } = await import('./tours');
  return getTourById(id);
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
