import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSignUpEmailAlreadyRegistered } from '../lib/supabaseAuthHelpers';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { fetchConsumerProfile, ensureConsumerProfile, consumerProfileEnsurePayloadFromAuthUser, normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import { isPhoneAvailableForSignup } from '../data/supabase-phone-signup';
import { isTraverionAdminUser } from '../lib/adminAuth';
import { customerSignInPartnerOnlyMessage, travelerSignUpDuplicateEmailMessage } from '../lib/customerSupplierAuthMessages';
import {
  isPartnerPortalPathForCurrentHost,
  isTraverionPartnerHost,
  supplierPortalPublicBaseUrl,
} from '../lib/partnerHost';
import { PARTNER_LOGIN_PATH } from '../lib/partnerPortalPaths';
import { clearSupabaseAuthStorage } from '../lib/clearSupabaseAuthStorage';
import { sanitizeAuthRedirectTo } from '../lib/authRedirect';
import { sanitizeTravelerAuthNext } from '../lib/travelerAuthLinks';
import { travelerSessionIsPartnerOnly } from '../lib/traveler-session-authority';
import { userHasSupplierProfile } from '../lib/supplierPortalAccess';
import { isPasswordRecoveryActive } from '../lib/passwordRecoveryFlow';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    options?: {
      redirectTo?: string;
      phoneNumber?: string;
      firstName?: string;
      lastName?: string;
      /** `next` query preserved for post-confirm sign-in redirect (default `account`). */
      afterConfirmNext?: string;
    }
  ) => Promise<{ error?: string; hasSession?: boolean }>;
  signOut: () => Promise<void>;
  /** Open the auth modal; call onSuccess after user signs in/up (e.g. to open booking). */
  requestAuth: (options?: { onSuccess?: () => void }) => void;
  authModalOpen: boolean;
  closeAuthModal: () => void;
  triggerAuthSuccess: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function clearPartnerOnlyTravelerSession(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* still clear storage */
  }
  clearSupabaseAuthStorage();
}

/** Reject restored partner-only sessions on traveler surfaces (localhost same-origin bleed). */
async function travelerUserAllowed(user: User): Promise<boolean> {
  if (isTraverionAdminUser(user)) return true;
  // Phase 1711: partner shell must not run this gate — team JWTs resolve owner profile via
  // fetchSupplierProfile and would be wiped as "partner-only" while SupplierAuth correctly admits them.
  if (isTraverionPartnerHost()) return true;
  // Phase 1857: localhost serves /login + /partner/* for the partner product on the same
  // origin as the traveler app. Wipe only on traveler surfaces — not while the partner shell is active.
  if (
    typeof window !== 'undefined' &&
    isPartnerPortalPathForCurrentHost(window.location.pathname)
  ) {
    return true;
  }
  // Phase 1857: identity-level skip — partner signup metadata means this JWT belongs to the
  // partner product. Traveler AuthProvider must not clear it during login→/partner transitions.
  const partnerMeta = (user.user_metadata as { traverion_product?: string } | undefined)
    ?.traverion_product;
  if (partnerMeta === 'partner') return true;
  if (!supabase) return false;
  // Phase 1711: own supplier_profiles row only — not resolveSupplierId (team → owner).
  try {
    const [hasSupplierProfile, consumerRow] = await Promise.all([
      userHasSupplierProfile(supabase, user.id),
      fetchConsumerProfile(user.id),
    ]);
    // Phase 1771: profile lookup failure (null) must not wipe a real traveler session.
    // Only confirmed partner-only (hasSupplierProfile === true, no consumer) is rejected.
    if (hasSupplierProfile === null) return true;
    return !travelerSessionIsPartnerOnly({
      hasSupplierProfile,
      hasConsumerProfile: Boolean(consumerRow),
    });
  } catch {
    // Phase 1780: consumer_profiles SELECT error must not look like “no consumer profile”.
    return true;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const pendingOnSuccess = useRef<(() => void) | null>(null);
  const gateGen = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      return;
    }

    const applySessionUser = async (next: User | null) => {
      const gen = ++gateGen.current;
      if (!next) {
        if (gen === gateGen.current) setUser(null);
        return;
      }
      // Phase 1159: unconfirmed sessions must not look signed-in (checkout requires verified email).
      if (!next.email_confirmed_at && !isTraverionAdminUser(next)) {
        if (supabase) await supabase.auth.signOut({ scope: 'local' });
        if (gen === gateGen.current) setUser(null);
        return;
      }
      const allowed = await travelerUserAllowed(next);
      if (gen !== gateGen.current) return;
      if (!allowed) {
        // Phase 1718: partner-only recovery on www must keep the session for updateUser
        // (1717 stays on marketing host). Do not wipe; leave React user null.
        if (isPasswordRecoveryActive()) {
          if (gen === gateGen.current) setUser(null);
          return;
        }
        await clearPartnerOnlyTravelerSession();
        if (gen === gateGen.current) setUser(null);
        return;
      }
      setUser(next);
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await applySessionUser(session?.user ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySessionUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Not configured' };
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) return { error: error.message };
    if (data.user && !data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      return { error: 'Please confirm your email before signing in.' };
    }
    if (data.user && !isTraverionAdminUser(data.user)) {
      // Phase 1711: own-row supplier check (not resolveSupplierId) so invited teammates are not
      // misclassified as partner-only owners on the traveler site.
      const [hasSupplierProfile, consumerRow] = await Promise.all([
        userHasSupplierProfile(supabase, data.user.id),
        fetchConsumerProfile(data.user.id),
      ]);
      if (hasSupplierProfile === null) {
        await supabase.auth.signOut();
        return { error: 'Could not verify your account. Try again.' };
      }
      if (
        travelerSessionIsPartnerOnly({
          hasSupplierProfile,
          hasConsumerProfile: Boolean(consumerRow),
        })
      ) {
        await supabase.auth.signOut();
        const partnerLoginUrl = `${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`;
        return { error: customerSignInPartnerOnlyMessage(partnerLoginUrl) };
      }
      const ensured = await ensureConsumerProfile(data.user.id, consumerProfileEnsurePayloadFromAuthUser(data.user));
      if (!ensured.success) {
        await supabase.auth.signOut();
        return { error: ensured.error ?? 'Could not load your account profile.' };
      }
    }
    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, options?: { redirectTo?: string; phoneNumber?: string; firstName?: string; lastName?: string; afterConfirmNext?: string }) => {
    if (!supabase) return { error: 'Not configured' };
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizeConsumerPhone(options?.phoneNumber ?? '');
    if (!normalizedPhone) return { error: 'Phone number is required' };

    const first = (options?.firstName ?? '').trim();
    const last = (options?.lastName ?? '').trim();
    const displayNameFromSignup = [first, last].filter(Boolean).join(' ').trim() || null;

    const availability = await isPhoneAvailableForSignup(options?.phoneNumber ?? '');
    if (availability.error) return { error: availability.error };
    if (!availability.available) return { error: 'An account with this phone number already exists. Try signing in instead.' };

    const next = sanitizeTravelerAuthNext(options?.afterConfirmNext ?? 'account');
    const confirmQs = new URLSearchParams({ next }).toString();
    const fallbackRedirect = `${publicSiteBaseUrl()}/email-confirmed?${confirmQs}`;
    const redirectTo = sanitizeAuthRedirectTo(options?.redirectTo ?? fallbackRedirect, publicSiteBaseUrl(), fallbackRedirect);
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          customer_phone: normalizedPhone,
          ...(first ? { customer_first_name: first } : {}),
          ...(last ? { customer_last_name: last } : {}),
          ...(displayNameFromSignup
            ? { full_name: displayNameFromSignup, display_name: displayNameFromSignup }
            : {}),
        },
      },
    });
    if (error) {
      const em = error.message.toLowerCase();
      if (
        em.includes('already registered') ||
        em.includes('already been registered') ||
        em.includes('user already exists')
      ) {
        const partnerLoginUrl = `${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`;
        return { error: travelerSignUpDuplicateEmailMessage(partnerLoginUrl), hasSession: false };
      }
      return { error: error.message, hasSession: false };
    }

    if (isSignUpEmailAlreadyRegistered(data.user)) {
      const partnerLoginUrl = `${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`;
      return { error: travelerSignUpDuplicateEmailMessage(partnerLoginUrl), hasSession: false };
    }

    if (data.session) {
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        return { error: undefined, hasSession: false };
      }
      const ensured = await ensureConsumerProfile(data.user.id, {
        display_name: displayNameFromSignup,
        contact_phone: normalizedPhone,
      });
      if (!ensured.success) {
        await supabase.auth.signOut();
        return { error: ensured.error, hasSession: false };
      }
    }
    return { error: undefined, hasSession: !!data?.session };
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* storage clear below */
      }
    }
    clearSupabaseAuthStorage();
  }, []);

  const requestAuth = useCallback((options?: { onSuccess?: () => void }) => {
    pendingOnSuccess.current = options?.onSuccess ?? null;
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    pendingOnSuccess.current = null;
  }, []);

  const runPendingOnSuccess = useCallback(() => {
    if (pendingOnSuccess.current) {
      pendingOnSuccess.current();
      pendingOnSuccess.current = null;
    }
    setAuthModalOpen(false);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    requestAuth,
    authModalOpen,
    closeAuthModal,
    triggerAuthSuccess: runPendingOnSuccess,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}