import {
  consumerProfileEnsurePayloadFromAuthUser,
  ensureConsumerProfile,
  fetchConsumerProfile,
} from '../data/supabase-consumer-profile';
import { isTraverionAdminUser } from './adminAuth';
import type { EmailVerifyNotice } from './emailVerifiedLanding';
import { supabase, isSupabaseConfigured } from './supabase';
import { userHasSupplierProfile } from './supplierPortalAccess';
import { travelerSessionIsPartnerOnly } from './traveler-session-authority';

/**
 * Finish a traveler confirmation link: keep a verified session, or classify why it cannot continue.
 * Does not sign the traveler out and does not send them to the login page.
 */
export async function settleTravelerEmailConfirm(): Promise<EmailVerifyNotice> {
  if (!isSupabaseConfigured() || !supabase) return 'invalid';
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.email_confirmed_at) return 'invalid';
  if (isTraverionAdminUser(user)) return 'success';

  // Phase 1711: own-row supplier check — team JWTs must not look like partner-only owners.
  const [hasSupplierProfile, consumerRow] = await Promise.all([
    userHasSupplierProfile(supabase, user.id),
    fetchConsumerProfile(user.id),
  ]);
  if (hasSupplierProfile === null) return 'invalid';
  if (
    travelerSessionIsPartnerOnly({
      hasSupplierProfile,
      hasConsumerProfile: Boolean(consumerRow),
    })
  ) {
    return 'partner';
  }

  const ensured = await ensureConsumerProfile(user.id, consumerProfileEnsurePayloadFromAuthUser(user));
  if (!ensured.success) return 'invalid';
  return 'success';
}
