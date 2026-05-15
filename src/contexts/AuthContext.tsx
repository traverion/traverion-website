import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSignUpEmailAlreadyRegistered } from '../lib/supabaseAuthHelpers';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import {
  consumerProfileEnsurePayloadFromAuthUser,
  ensureConsumerProfile,
  fetchConsumerProfile,
  normalizeConsumerPhone,
} from '../data/supabase-consumer-profile';
import { fetchSupplierProfile } from '../data/supabase-supplier-profile';
import { isPhoneAvailableForSignup } from '../data/supabase-phone-signup';
import { isTraverionAdminUser } from '../lib/adminAuth';
import { customerSignInPartnerOnlyMessage, travelerSignUpDuplicateEmailMessage } from '../lib/customerSupplierAuthMessages';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { PARTNER_LOGIN_PATH } from '../lib/partnerPortalPaths';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const pendingOnSuccess = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
      const [supplierRow, consumerRow] = await Promise.all([
        fetchSupplierProfile(data.user.id),
        fetchConsumerProfile(data.user.id),
      ]);
      if (supplierRow && !consumerRow) {
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
    return { error: error?.message };
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

    const next = (options?.afterConfirmNext ?? 'account').trim() || 'account';
    const confirmQs = new URLSearchParams({ next }).toString();
    const redirectTo = options?.redirectTo ?? `${publicSiteBaseUrl()}/email-confirmed?${confirmQs}`;
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          customer_phone: normalizedPhone,
          ...(first ? { customer_first_name: first } : {}),
          ...(last ? { customer_last_name: last } : {}),
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
        display_name: displayNameFromSignup ?? (normalizedEmail.split('@')[0] ?? null),
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
    if (supabase) await supabase.auth.signOut();
    setUser(null);
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