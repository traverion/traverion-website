import { fetchConsumerProfile } from '../data/supabase-consumer-profile';
import { fetchSupplierProfile } from '../data/supabase-supplier-profile';
import { supabase } from './supabase';

/** Pure portal choice after recovery session — partner wins when supplier-side access exists. */
export function passwordRecoveryPortalFromAccess(params: {
  hasSupplierProfile: boolean;
  hasTeamMembership: boolean;
}): 'partner' | 'traveler' {
  if (params.hasSupplierProfile || params.hasTeamMembership) return 'partner';
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
): Promise<'partner' | 'traveler'> {
  let hasSupplierProfile = false;
  let hasTeamMembership = false;
  try {
    const supplierRow = await fetchSupplierProfile(userId, { throwOnError: true });
    hasSupplierProfile = Boolean(supplierRow);
  } catch {
    // Fall through to team check — do not invent traveler when profile lookup fails.
  }
  try {
    hasTeamMembership = await userHasSupplierTeamMembership(userId);
  } catch {
    /* keep false */
  }
  if (hasSupplierProfile || hasTeamMembership) {
    return passwordRecoveryPortalFromAccess({ hasSupplierProfile, hasTeamMembership });
  }
  // Consumer-only (or unknown): traveler shell. Consumer fetch is informational only.
  try {
    await fetchConsumerProfile(userId);
  } catch {
    /* ignore */
  }
  return 'traveler';
}
