import { fetchConsumerProfile } from '../data/supabase-consumer-profile';
import { fetchSupplierProfile } from '../data/supabase-supplier-profile';
import { supabase } from './supabase';

export type PasswordRecoveryPortal = 'partner' | 'traveler' | 'unavailable';

/** Pure portal choice after recovery session — partner wins when supplier-side access exists. */
export function passwordRecoveryPortalFromAccess(params: {
  hasSupplierProfile: boolean;
  hasTeamMembership: boolean;
  supplierLookupFailed?: boolean;
  teamLookupFailed?: boolean;
}): PasswordRecoveryPortal {
  if (params.hasSupplierProfile || params.hasTeamMembership) return 'partner';
  // Do not invent traveler when supplier-side lookups failed — wrong shell is worse than retry.
  if (params.supplierLookupFailed || params.teamLookupFailed) return 'unavailable';
  return 'traveler';
}

async function userHasSupplierTeamMembership(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('supplier_team_members')
    .select('user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.user_id);
}

/** After a recovery session exists, decide which portal shell to show. */
export async function resolvePasswordRecoveryPortal(
  userId: string
): Promise<PasswordRecoveryPortal> {
  let hasSupplierProfile = false;
  let hasTeamMembership = false;
  let supplierLookupFailed = false;
  let teamLookupFailed = false;
  try {
    const supplierRow = await fetchSupplierProfile(userId, { throwOnError: true });
    hasSupplierProfile = Boolean(supplierRow);
  } catch {
    supplierLookupFailed = true;
  }
  try {
    hasTeamMembership = await userHasSupplierTeamMembership(userId);
  } catch {
    teamLookupFailed = true;
  }
  const portal = passwordRecoveryPortalFromAccess({
    hasSupplierProfile,
    hasTeamMembership,
    supplierLookupFailed,
    teamLookupFailed,
  });
  if (portal !== 'traveler') return portal;
  // Consumer fetch is informational only for traveler shell.
  try {
    await fetchConsumerProfile(userId);
  } catch {
    /* ignore */
  }
  return 'traveler';
}
