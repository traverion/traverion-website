import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; hasSession?: boolean }>;
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Not configured' };
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message, hasSession: !!data?.session };
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