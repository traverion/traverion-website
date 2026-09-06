import { useLayoutEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  establishPasswordRecoverySession,
  subscribePasswordRecovery,
  clearAuthHashFromUrl,
  stripRecoveryQueryFromUrl,
  updatePasswordAfterRecovery,
} from '../../lib/passwordRecoveryFlow';

type Phase = 'loading' | 'form' | 'invalid' | 'timeout' | 'success';

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

  useLayoutEffect(() => {
    if (!supabase) {
      setPhase('invalid');
      return;
    }

    let cancelled = false;

    const activate = () => {
      if (cancelled) return;
      clearAuthHashFromUrl();
      stripRecoveryQueryFromUrl();
      setPhase('form');
    };

    const unsub = subscribePasswordRecovery(supabase, activate);

    void establishPasswordRecoverySession(supabase).then((result) => {
      if (cancelled) return;
      if (result === 'ready') activate();
      else if (result === 'timeout') setPhase('timeout');
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
      <div className="py-10 text-center">
        <p className="font-display text-2xl text-ink">Verifying your reset link</p>
        <p className="mt-2 text-sm text-ink-muted">This usually takes a few seconds.</p>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-ink-muted" role="alert">
          This page only works from the secure link in your password reset email. The link may be invalid, expired, or
          already used.
        </p>
        <p className="text-sm text-ink-muted">
          Open the page from a new reset email, or request one from log in → Forgot password.
        </p>
        <a href={loginHref} className="tv-btn-primary inline-flex w-full justify-center">
          {loginLabel}
        </a>
      </div>
    );
  }

  if (phase === 'timeout') {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-ink-muted" role="alert">
          We could not verify your reset link in time. Try opening the link from your email again, or request a new
          reset email.
        </p>
        <a href={loginHref} className="tv-btn-primary inline-flex w-full justify-center">
          {loginLabel}
        </a>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-ink">Your password was updated. {successHint}</p>
        <button type="button" onClick={onSuccess} className="tv-btn-primary w-full">
          Continue to sign in
        </button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <p className="text-sm text-ink-muted">{description}</p>
      <div>
        <label htmlFor="set-new-password" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
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
          className="tv-input"
          aria-invalid={fieldErrors.password ? true : undefined}
        />
        <p className="text-xs text-ink-faint mt-1">At least {minPasswordLength} characters</p>
        {fieldErrors.password && (
          <p className="mt-1.5 text-sm text-red-800" role="alert">
            {fieldErrors.password}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="set-new-password-confirm" className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
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
          className="tv-input"
          aria-invalid={fieldErrors.confirm ? true : undefined}
        />
        {fieldErrors.confirm && (
          <p className="mt-1.5 text-sm text-red-800" role="alert">
            {fieldErrors.confirm}
          </p>
        )}
      </div>
      <button type="submit" disabled={submitting} className="tv-btn-primary w-full disabled:opacity-50">
        {submitting ? 'Saving…' : 'Update password'}
      </button>
      <a href={loginHref} className="lux-flat block text-center text-sm text-ink-muted hover:text-ink">
        {loginLabel}
      </a>
    </form>
  );
}
