import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type SupplierUser = User | { id: string; email?: string };

type SupplierAuthContextValue = {
  user: SupplierUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isSupabase: boolean;
};

const SupplierAuthContext = createContext<SupplierAuthContextValue | null>(null);

export function SupplierAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupplierUser | null>(null);
  const [loading, setLoading] = useState(true);
  const isSupabase = isSupabaseConfigured();

  useEffect(() => {
    if (!isSupabase) {
      localStorage.removeItem('supplier_authenticated');
      setUser(null);
      setLoading(false);
      return;
    }
    if (!supabase) {
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
  }, [isSupabase]);

  const signOut = useCallback(async () => {
    if (isSupabase && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('supplier_authenticated');
      setUser(null);
    }
  }, [isSupabase]);

  const value: SupplierAuthContextValue = {
    user,
    loading,
    signOut,
    isSupabase,
  };

  return (
    <SupplierAuthContext.Provider value={value}>
      {children}
    </SupplierAuthContext.Provider>
  );
}

export function useSupplierAuth(): SupplierAuthContextValue {
  const ctx = useContext(SupplierAuthContext);
  if (!ctx) throw new Error('useSupplierAuth must be used within SupplierAuthProvider');
  return ctx;
}
