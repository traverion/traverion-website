import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  establishPasswordRecoverySession,
  subscribePasswordRecovery,
  clearAuthHashFromUrl,
  updatePasswordAfterRecovery,
} from '../../lib/passwordRecoveryFlow';
import { authInputErrorClasses } from '../../lib/authFormValidation';

type Phase = 'loading' | 'form' | 'invalid' | 'success';

type FieldKey = 'password' | 'confirm';

type Props = {
  minPasswordLength: number;
  /** Shown under the main title. */
  description?: string;
  /** After a successful update, before calling onSuccess. */
  successHint?: string;
  onSuccess: () => void;
  loginHref: string;
  loginLabel?: string;
};

export default function SetNewPasswordForm({
  minPasswordLength,
  description = 'Choose a new password for your account. This page only works from the secure link in your email.',
  successHint = 'You can now sign in with your new password.',
  onSuccess,
  loginHref,
  loginLabel = 'Back to sign in',
}: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setPhase('invalid');
      return;
    }

    let cancelled = false;

    const activate = () => {
      if (cancelled) return;
      clearAuthHashFromUrl();
      setPhase('form');
    };

    const unsub = subscribePasswordRecovery(supabase, activate);

    void establishPasswordRecoverySession(supabase).then((result) => {
      if (cancelled) return;
      if (result === 'ready') activate();
      else setPhase('invalid');
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setFieldErrors({});
    const next: Partial<Record<FieldKey, string>> = {};
    if (!password) next.password = 'Enter a new password.';
    else if (password.length < minPasswordLength) next.password = `Use at least ${minPasswordLength} characters.`;
    if (!confirm) next.confirm = 'Confirm your new password.';
    else if (password && confirm && password !== confirm) next.confirm = 'Passwords do not match.';
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await updatePasswordAfterRecovery(supabase, password, {
        minLength: minPasswordLength,
      });
      if (err) {
        setFieldErrors({ password: err });
        return;
      }
      await supabase.auth.signOut();
      setPhase('success');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="py-8 text-center text-sm text-gray-600">
        <p>Verifying your reset link…</p>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100" role="alert">
          This reset link is invalid or has expired. Request a new password reset from the sign-in page.
        </p>
        <a href={loginHref} className="inline-block text-sm font-medium text-finland hover:underline">
          {loginLabel}
        </a>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="space-y-4 py-2">
        <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-3 text-sm text-green-900">
          Your password was updated. {successHint}
        </div>
        <button
          type="button"
          onClick={onSuccess}
          className="w-full py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-colors"
        >
          Continue to sign in
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <p className="text-sm text-gray-600">{description}</p>
      <div>
        <label htmlFor="set-new-password" className="block text-sm font-medium text-gray-700 mb-1">
          New password
        </label>
        <input
          id="set-new-password"
          type="password"
          name="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((p) => {
              const n = { ...p };
              delete n.password;
              return n;
            });
          }}
          autoComplete="new-password"
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.password)}`}
          aria-invalid={fieldErrors.password ? true : undefined}
        />
        <p className="text-xs text-gray-500 mt-1">At least {minPasswordLength} characters</p>
        {fieldErrors.password && (
          <p className="mt-1.5 text-sm text-red-600" role="alert">
            {fieldErrors.password}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="set-new-password-confirm" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm new password
        </label>
        <input
          id="set-new-password-confirm"
          type="password"
          name="confirm-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setFieldErrors((p) => {
              const n = { ...p };
              delete n.confirm;
              return n;
            });
          }}
          autoComplete="new-password"
          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.confirm)}`}
          aria-invalid={fieldErrors.confirm ? true : undefined}
        />
        {fieldErrors.confirm && (
          <p className="mt-1.5 text-sm text-red-600" role="alert">
            {fieldErrors.confirm}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-colors disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Update password'}
      </button>
      <a href={loginHref} className="block text-center text-sm text-finland hover:underline">
        {loginLabel}
      </a>
    </form>
  );
}
