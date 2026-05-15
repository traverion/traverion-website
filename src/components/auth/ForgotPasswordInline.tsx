import { authInputErrorClasses } from '../../lib/authFormValidation';

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
  className = 'p-6 sm:p-8 space-y-4 sm:space-y-5',
}: Props) {
  return (
    <form noValidate onSubmit={onSubmit} className={className}>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onBack}
          className="self-start text-sm font-medium text-finland hover:underline"
        >
          Back to sign in
        </button>
        <h2 className="text-lg font-semibold text-gray-900 pt-1">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      {successMessage ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-3 text-sm text-green-900">
            {successMessage}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={emailInputId} className="block text-sm font-medium text-gray-700 mb-1">
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
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldError)}`}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${emailInputId}-err` : undefined}
            />
            {fieldError && (
              <p id={`${emailInputId}-err`} className="mt-1.5 text-sm text-red-600" role="alert">
                {fieldError}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onBack}
              disabled={sending}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-finland text-white text-sm font-semibold hover:bg-finland-dark disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
