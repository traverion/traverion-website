import { useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Props = {
  onBack: () => void;
  userEmail: string;
  isSupabase: boolean;
  supabase: SupabaseClient | null;
};

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
    <div className="space-y-4 sm:space-y-5 max-w-lg w-full min-w-0">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-finland hover:text-finland-dark hover:underline"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to account settings
      </button>

      <div>
        <div className="flex items-center gap-2 text-finland mb-1">
          <Shield className="w-6 h-6" aria-hidden />
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-gray-900">Change password</h1>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Enter your current password, then your new password twice. Your session stays signed in after a successful
          change.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
        {!isSupabase && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Supabase auth is not configured here, so passwords cannot be updated from this build.
          </p>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
            Your password was updated successfully.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700">
          Current password
          <input
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          New password (min. 8 characters)
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Confirm new password
          <input
            type="password"
            name="confirm-new-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland"
          />
        </label>

        <button
          type="button"
          disabled={saving || !isSupabase}
          onClick={() => void submit()}
          className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark disabled:opacity-50"
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </div>
  );
}
