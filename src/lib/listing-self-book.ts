/**
 * Phase 1147: client mirror of checkout edge self-book rejection (1146).
 * Owner match is sync; team membership is optional async.
 */

import { supabase } from './supabase';

export function isListingOwnerSelfBook(
  viewerUserId: string | null | undefined,
  listingSupplierId: string | null | undefined
): boolean {
  const uid = (viewerUserId ?? '').trim();
  const sid = (listingSupplierId ?? '').trim();
  return Boolean(uid && sid && uid === sid);
}

/** True when the viewer is the listing owner or a supplier_team_members row for that owner. */
export async function viewerIsListingSupplierSide(
  viewerUserId: string | null | undefined,
  listingSupplierId: string | null | undefined
): Promise<boolean> {
  if (isListingOwnerSelfBook(viewerUserId, listingSupplierId)) return true;
  const uid = (viewerUserId ?? '').trim();
  const sid = (listingSupplierId ?? '').trim();
  if (!uid || !sid || !supabase) return false;
  const { data } = await supabase
    .from('supplier_team_members')
    .select('user_id')
    .eq('supplier_id', sid)
    .eq('user_id', uid)
    .maybeSingle();
  return Boolean(data?.user_id);
}

export const LISTING_SELF_BOOK_BLOCKED =
  'You cannot book your own listing. Use a traveler account to test checkout.';
