/**
 * Mirror of src/lib/notify-supplier-event-auth.ts for Deno edge runtime.
 * Phase 1093: caller authorization for notify-supplier-event.
 */

export function isServiceRoleBearer(
  authHeader: string | null | undefined,
  serviceRoleKey: string | null | undefined
): boolean {
  const key = (serviceRoleKey ?? '').trim();
  if (!key) return false;
  const auth = (authHeader ?? '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer.length > 0 && bearer === key;
}

export function supplierEventPartyAllowsNotify(params: {
  callerUserId?: string | null;
  callerEmail?: string | null;
  listingSupplierId?: string | null;
  claimedSupplierId?: string | null;
  callerIsTeamMember?: boolean;
  guestUserId?: string | null;
  guestEmail?: string | null;
  reviewAuthorUserId?: string | null;
}): boolean {
  const uid = (params.callerUserId ?? '').trim();
  const listingSupplier = (params.listingSupplierId ?? '').trim();
  const claimed = (params.claimedSupplierId ?? '').trim();
  if (!listingSupplier || !claimed || listingSupplier !== claimed) return false;

  if (uid && uid === listingSupplier) return true;
  if (params.callerIsTeamMember) return true;

  const guestUid = (params.guestUserId ?? '').trim();
  if (uid && guestUid && uid === guestUid) return true;

  const email = (params.callerEmail ?? '').trim().toLowerCase();
  const guestEmail = (params.guestEmail ?? '').trim().toLowerCase();
  if (email && guestEmail && email === guestEmail) return true;

  const author = (params.reviewAuthorUserId ?? '').trim();
  if (uid && author && uid === author) return true;

  return false;
}
