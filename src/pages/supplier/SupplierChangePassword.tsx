import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import type { SupabaseClient } from '@supabase/supabase-js';
import { userFacingError } from '../../lib/userFacingError';
import NoticeCallout from '../../components/NoticeCallout';

type Props = {
  onBack: () => void;
  userEmail: string;
  isSupabase: boolean;
  supabase: SupabaseClient | null;
};

function profileInputClass(disabled?: boolean): string {
  return `tv-input ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`;
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Current password is incorrect.';
  if (m.includes('same as')) return 'Choose a password that is different from your current one.';
  return 'Something went wrong. Check your details and try again.';
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
      setError(userFacingError(e, 'Something went wrong. Check your details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <button
        type="button"
        onClick={onBack}
        className="lux-flat inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Account
      </button>

      <SupplierPageHero
        title="Change password"
        description="Enter your current password, then your new password twice. Your session stays active after a successful change."
      />

      <div className="max-w-xl space-y-5 rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
        {!isSupabase ? (
          <NoticeCallout title="Password changes unavailable" tone="warn">
            Sign-in is not connected in this build, so passwords cannot be updated here.
          </NoticeCallout>
        ) : null}

        {success ? (
          <NoticeCallout title="Password updated" tone="success">
            Your password was updated successfully. Your session stays active.
          </NoticeCallout>
        ) : null}

        {error ? (
          <NoticeCallout title="Could not update password" tone="danger">
            {error}
          </NoticeCallout>
        ) : null}

        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5" htmlFor="supplier-current-password">
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
            <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5" htmlFor="supplier-new-password">
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
            <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5" htmlFor="supplier-confirm-password">
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <p className="text-xs text-ink-muted max-w-md">
            For security, we verify your current password before applying the new one.
          </p>
          <button
            type="button"
            disabled={saving || !isSupabase}
            onClick={() => void submit()}
            className="tv-btn-primary disabled:opacity-50"
          >
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}
