import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { authInputErrorClasses, isValidEmailFormat } from '../../lib/authFormValidation';

export type ForgotPasswordSendResult = { ok: true } | { ok: false; error: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Seeds the modal email when it opens (e.g. current sign-in email). */
  defaultEmail: string;
  sending: boolean;
  onSend: (normalizedEmail: string) => Promise<ForgotPasswordSendResult>;
  /** Optional heading (e.g. "Partner account" vs traveler). */
  title?: string;
};

export default function ForgotPasswordModal({
  open,
  onClose,
  defaultEmail,
  sending,
  onSend,
  title = 'Reset your password',
}: Props) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail.trim());
    setFieldError(null);
    setSuccessMessage(null);
  }, [open, defaultEmail]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setSuccessMessage(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError('Enter the email address you want the reset link sent to.');
      return;
    }
    if (!isValidEmailFormat(trimmed)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    const normalized = trimmed.toLowerCase();
    const result = await onSend(normalized);
    if (!result.ok) {
      setFieldError(result.error);
      return;
    }
    setSuccessMessage(
      `If an account exists for ${normalized}, you will get an email with a link to reset your password. Check spam too.`
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-modal-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 id="forgot-password-modal-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              We will email a secure link to the address below. It can be different from the email in the sign-in form.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4">
          {successMessage ? (
            <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-3 text-sm text-green-900">
              {successMessage}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="forgot-password-modal-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email for reset link
                </label>
                <input
                  id="forgot-password-modal-email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldError(null);
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={sending}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldError)}`}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? 'forgot-password-modal-email-err' : undefined}
                />
                {fieldError && (
                  <p id="forgot-password-modal-email-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldError}
                  </p>
                )}
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
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
          {successMessage && (
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl bg-finland text-white text-sm font-semibold hover:bg-finland-dark"
            >
              Close
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
