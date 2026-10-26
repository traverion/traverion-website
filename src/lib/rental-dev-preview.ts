import type { TourPackage } from '../types/tour';

/** Reserved ids. They are not database listings and must never reach checkout. */
export const RENTAL_DEV_PREVIEW_IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
] as const;

const PREVIEW_IDS = new Set<string>(RENTAL_DEV_PREVIEW_IDS);

export function isRentalDevPreviewId(id: string | null | undefined): boolean {
  return typeof id === 'string' && PREVIEW_IDS.has(id);
}

/**
 * Local catalog rows for development only.
 * Production builds drop the fixture module. These rows are never written to Supabase.
 */
export async function loadRentalDevPreviews(): Promise<TourPackage[]> {
  if (!import.meta.env.DEV) return [];
  const mod = await import('../data/rental-dev-preview.fixtures');
  return mod.RENTAL_DEV_PREVIEW_LISTINGS;
}
