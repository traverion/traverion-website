import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSignUpEmailAlreadyRegistered } from '../lib/supabaseAuthHelpers';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { ensureConsumerProfile, fetchConsumerProfile, normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import { fetchSupplierProfile } from '../data/supabase-supplier-profile';
import { isPhoneAvailableForSignup } from '../data/supabase-phone-signup';
import { isTraverionAdminUser } from '../lib/adminAuth';
import { SUPPLIER_ONLY_TRAVELER_SIGN_IN, TRAVELER_EMAIL_ALREADY_REGISTERED } from '../lib/customerSupplierAuthMessages';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    options?: { redirectTo?: string; phoneNumber?: string }
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
        return { error: SUPPLIER_ONLY_TRAVELER_SIGN_IN };
      }
      const userMeta = data.user.user_metadata as { phone?: string; customer_phone?: string } | undefined;
      const ensured = await ensureConsumerProfile(data.user.id, {
        display_name: normalizedEmail.split('@')[0] ?? null,
        contact_phone: userMeta?.customer_phone ?? userMeta?.phone ?? null,
      });
      if (!ensured.success) {
        await supabase.auth.signOut();
        return { error: ensured.error ?? 'Could not load your account profile.' };
      }
    }
    return { error: error?.message };
  }, []);

  const signUp = useCallback(async (email: string, password: string, options?: { redirectTo?: string; phoneNumber?: string }) => {
    if (!supabase) return { error: 'Not configured' };
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizeConsumerPhone(options?.phoneNumber ?? '');
    if (!normalizedPhone) return { error: 'Phone number is required' };

    const availability = await isPhoneAvailableForSignup(options?.phoneNumber ?? '');
    if (availability.error) return { error: availability.error };
    if (!availability.available) return { error: 'An account with this phone number already exists. Try signing in instead.' };

    const redirectTo = options?.redirectTo ?? `${publicSiteBaseUrl()}/log-in?next=account`;
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { customer_phone: normalizedPhone },
      },
    });
    if (error) {
      const em = error.message.toLowerCase();
      if (em.includes('already registered') || em.includes('user already exists')) {
        return { error: TRAVELER_EMAIL_ALREADY_REGISTERED, hasSession: false };
      }
      return { error: error.message, hasSession: false };
    }

    if (isSignUpEmailAlreadyRegistered(data.user)) {
      return { error: TRAVELER_EMAIL_ALREADY_REGISTERED, hasSession: false };
    }

    if (data.session) {
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        return { error: undefined, hasSession: false };
      }
      const ensured = await ensureConsumerProfile(data.user.id, {
        display_name: normalizedEmail.split('@')[0] ?? null,
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