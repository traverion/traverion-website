export type ForgotPasswordSendResult = { ok: true } | { ok: false; error: string };

type Props = {
  title: string;
  /** Shown under the title; defaults to a short explanation. */
  description?: string;
  email: string;
  onEmailChange: (value: string) => void;
  fieldError: string | null;
  successMessage: string | null;
  sending: boolean;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  onBack: () => void;
  emailInputId: string;
  className?: string;
};

const DEFAULT_DESCRIPTION =
  'We will email a secure link to the address below. It can be different from the email you use to sign in.';

export default function ForgotPasswordInline({
  title,
  description = DEFAULT_DESCRIPTION,
  email,
  onEmailChange,
  fieldError,
  successMessage,
  sending,
  onSubmit,
  onBack,
  emailInputId,
  className = 'space-y-4',
}: Props) {
  return (
    <form noValidate onSubmit={onSubmit} className={`${className} motion-safe:animate-fade-in`}>
      <div className="flex flex-col gap-1">
        <button type="button" onClick={onBack} className="lux-flat self-start text-sm text-ink-muted hover:text-ink">
          Back to sign in
        </button>
        <h2 className="font-display text-2xl text-ink tracking-tight pt-2">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>

      {successMessage ? (
        <div className="space-y-4">
          <p className="text-sm text-ink">{successMessage}</p>
          <button type="button" onClick={onBack} className="tv-btn-primary w-full">
            Done
          </button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={emailInputId} className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1.5">
              Email for reset link
            </label>
            <input
              id={emailInputId}
              type="email"
              name="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={sending}
              className="tv-input"
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${emailInputId}-err` : undefined}
            />
            {fieldError && (
              <p id={`${emailInputId}-err`} className="mt-1.5 text-sm text-red-800" role="alert">
                {fieldError}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" onClick={onBack} disabled={sending} className="tv-btn-ghost disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={sending} className="tv-btn-primary disabled:opacity-50">
              {sending ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
