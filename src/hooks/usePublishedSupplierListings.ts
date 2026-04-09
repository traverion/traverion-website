import { useState, useEffect, useCallback } from 'react';
import { getAllListingsAsync } from '../data/listings';
import { isSupabaseConfigured } from '../lib/supabase';
import type { TourPackage } from '../types/tour';

type Options = {
  /**
   * When the first request fails, set listings to [] so the UI can leave a loading skeleton (e.g. Packages).
   * When false, keep null on first error so callers can fall back to non-Supabase data (Home, Destination).
   */
  emptyOnFirstError?: boolean;
};

/**
 * Loads published supplier listings from Supabase for the public site (Packages, Home, etc.).
 * Refetches when the tab becomes visible again so newly published tours show without a full reload.
 */
export function usePublishedSupplierListings(options?: Options): {
  listings: TourPackage[] | null;
  error: string | null;
  reload: () => void;
} {
  const emptyOnFirstError = options?.emptyOnFirstError !== false;
  const [listings, setListings] = useState<TourPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!isSupabaseConfigured()) return;
    getAllListingsAsync({ includeSeed: false, includeHolidayPackages: false })
      .then((data) => {
        setListings(data);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load tours');
        if (emptyOnFirstError) {
          setListings((prev) => (prev === null ? [] : prev));
        }
      });
  }, [emptyOnFirstError]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    reload();
    const onVis = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const onPublishedChanged = () => reload();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('traverion:published-listings-changed', onPublishedChanged);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('traverion:published-listings-changed', onPublishedChanged);
    };
  }, [reload]);

  return { listings, error, reload };
}
