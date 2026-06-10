import { useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Shield } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Props = {
  onBack: () => void;
  userEmail: string;
  isSupabase: boolean;
  supabase: SupabaseClient | null;
};

function profileInputClass(disabled?: boolean): string {
  return `w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-finland/25 focus:border-finland outline-none transition-shadow ${
    disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
  }`;
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Current password is incorrect.';
  if (m.includes('same as')) return 'Choose a password that is different from your current one.';
  return message;
}

export default function SupplierChangePassword({ onBack, userEmail, isSupabase, supabase }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError(null);
    setSuccess(false);
    if (!isSupabase || !supabase) {
      setError('Password changes are not available because sign-in is not connected.');
      return;
    }
    const email = userEmail.trim().toLowerCase();
    if (!email) {
      setError('No email on this session. Sign out and sign in again.');
      return;
    }
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.');
      return;
    }

    setSaving(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signErr) {
        setError(mapAuthError(signErr.message));
        return;
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) {
        setError(mapAuthError(updErr.message));
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl w-full min-w-0 animate-fade-in-up">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-finland hover:text-finland-dark transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to account settings
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-finland/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-finland" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Change password</h1>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              Enter your current password, then your new password twice. Your session stays active after a successful
              change.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 sm:px-6 border-b border-gray-100 bg-gradient-to-br from-slate-50/90 to-white">
          <div className="w-10 h-10 rounded-xl bg-finland/10 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-5 h-5 text-finland" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">New password</h2>
            <p className="text-sm text-gray-600 mt-0.5">All fields are required.</p>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {!isSupabase && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Supabase auth is not configured here, so passwords cannot be updated from this build.
            </p>
          )}

          {success && (
            <div
              className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900"
              role="status"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
              <span>Your password was updated successfully.</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900" role="alert">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="supplier-current-password">
              Current password
            </label>
            <input
              id="supplier-current-password"
              type="password"
              name="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setError(null);
                setSuccess(false);
              }}
              className={profileInputClass(!isSupabase)}
              disabled={!isSupabase}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="supplier-new-password">
                New password
              </label>
              <input
                id="supplier-new-password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                  setSuccess(false);
                }}
                placeholder="Min. 8 characters"
                className={profileInputClass(!isSupabase)}
                disabled={!isSupabase}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="supplier-confirm-password">
                Confirm new password
              </label>
              <input
                id="supplier-confirm-password"
                type="password"
                name="confirm-new-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                  setSuccess(false);
                }}
                className={profileInputClass(!isSupabase)}
                disabled={!isSupabase}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-gray-200 bg-gray-50/80 px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-gray-600 max-w-md">
          For security, we verify your current password before applying the new one.
        </p>
        <button
          type="button"
          disabled={saving || !isSupabase}
          onClick={() => void submit()}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-finland text-white text-sm font-semibold shadow-sm hover:bg-finland-dark disabled:opacity-50 transition-colors min-w-[12rem]"
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </div>
  );
}
