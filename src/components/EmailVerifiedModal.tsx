import { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { customerSignInPartnerOnlyMessage } from '../lib/customerSupplierAuthMessages';
import {
  clearEmailVerifyNotice,
  resendTravelerConfirmation,
  type EmailVerifyNotice,
} from '../lib/emailVerifiedLanding';
import { AUTH_CONFIRMATION_EMAIL_REQUESTED } from '../lib/booking-confirmation-copy';
import { isValidEmailFormat } from '../lib/authFormValidation';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { PARTNER_LOGIN_PATH } from '../lib/partnerPortalPaths';
import { useDialogFocus } from '../hooks/useDialogFocus';
import NoticeCallout from './NoticeCallout';

type Props = {
  notice: EmailVerifyNotice;
  onClose: () => void;
};

export default function EmailVerifiedModal({ notice, onClose }: Props) {
  const { requestAuth, signOut } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const partnerLoginUrl = `${supplierPortalPublicBaseUrl()}${PARTNER_LOGIN_PATH}`;

  const dismiss = () => {
    clearEmailVerifyNotice();
    onClose();
  };

  useDialogFocus(true, dialogRef, dismiss);

  const openSignIn = () => {
    dismiss();
    requestAuth();
  };

  const resend = async () => {
    setResendError(null);
    setResendMessage(null);
    if (!isValidEmailFormat(email)) {
      setResendError('Enter a valid email address.');
      return;
    }
    setResending(true);
    const result = await resendTravelerConfirmation(email);
    setResending(false);
    if (result.error) {
      setResendError(result.error);
      return;
    }
    setResendMessage(AUTH_CONFIRMATION_EMAIL_REQUESTED);
  };

  const title =
    notice === 'success'
      ? 'Email verified'
      : notice === 'expired'
        ? 'This link has expired'
        : notice === 'partner'
          ? 'Partner account'
          : 'Link not valid';

  return (
    <div
      ref={dialogRef}
      className="tv-verify-overlay fixed inset-0 z-[30000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-verified-title"
      onClick={dismiss}
    >
      <div
        className="tv-verify-card bg-paper-raised text-ink rounded-t-2xl sm:rounded-2xl shadow-soft-xl ring-1 ring-black/[0.06] w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {notice === 'success' ? <VerifiedCheck /> : null}
        <h2 id="email-verified-title" className="font-display text-2xl text-ink tracking-tight">
          {title}
        </h2>
        {notice === 'success' ? (
          <p className="mt-3 text-sm text-ink-muted leading-relaxed">
            Your email is verified and you’re signed in. You can book from here.
          </p>
        ) : null}
        {notice === 'expired' || notice === 'invalid' ? (
          <div className="mt-4 space-y-3">
            <NoticeCallout title={notice === 'expired' ? 'Request a new link' : 'Try again'} tone="danger">
              {notice === 'expired'
                ? 'This confirmation link has expired or was already used. Request a new one, or sign in if you already verified.'
                : 'This confirmation link is missing or no longer works. Request a new one, or sign in if you already verified.'}
            </NoticeCallout>
            <label htmlFor="email-verified-resend" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email-verified-resend"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="tv-input w-full"
              placeholder="you@email.com"
            />
            {resendError ? (
              <p className="text-sm text-red-600" role="alert">
                {resendError}
              </p>
            ) : null}
            {resendMessage ? (
              <NoticeCallout title="Check your email" tone="success">
                {resendMessage}
              </NoticeCallout>
            ) : null}
          </div>
        ) : null}
        {notice === 'partner' ? (
          <div className="mt-4">
            <NoticeCallout title="Use Traverion Partner" tone="info">
              {customerSignInPartnerOnlyMessage(partnerLoginUrl)}
            </NoticeCallout>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          {notice === 'success' ? (
            <button type="button" className="tv-btn-primary w-full justify-center" onClick={dismiss}>
              Continue
            </button>
          ) : null}
          {notice === 'expired' || notice === 'invalid' ? (
            <>
              <button
                type="button"
                className="tv-btn-primary w-full justify-center"
                disabled={resending}
                onClick={() => void resend()}
              >
                {resending ? 'Sending…' : 'Send a new link'}
              </button>
              <button type="button" className="tv-btn-secondary w-full justify-center" onClick={openSignIn}>
                Sign in
              </button>
            </>
          ) : null}
          {notice === 'partner' ? (
            <button
              type="button"
              className="tv-btn-primary w-full justify-center"
              onClick={() => {
                clearEmailVerifyNotice();
                void signOut().then(() => {
                  window.location.replace(partnerLoginUrl);
                });
              }}
            >
              Go to partner sign-in
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VerifiedCheck() {
  return (
    <div className="tv-verify-check mb-4" aria-hidden>
      <svg viewBox="0 0 52 52">
        <circle className="tv-verify-check__circle" cx="26" cy="26" r="23" />
        <path className="tv-verify-check__tick" d="M15.5 27.2l6.4 6.4 14.6-16" />
      </svg>
    </div>
  );
}
