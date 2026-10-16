import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { normalizeConsumerPhone } from '../../data/supabase-consumer-profile';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX, EMAIL_ALREADY_IN_USE } from '../../lib/customerSupplierAuthMessages';
import { supplierPortalLandingHref } from '../../lib/partnerHost';
import { isValidEmailFormat } from '../../lib/authFormValidation';
import ForgotPasswordInline, { type ForgotPasswordSendResult } from './ForgotPasswordInline';
import { TRAVELER_RESET_PASSWORD_PATH } from '../../lib/partnerPortalPaths';
import { AUTH_CONFIRMATION_EMAIL_REQUESTED, AUTH_PASSWORD_RESET_REQUESTED } from '../../lib/booking-confirmation-copy';
import { resendTravelerConfirmation } from '../../lib/emailVerifiedLanding';
import { splitTravelerFullName } from '../../lib/splitTravelerFullName';
import { TRAVELER_PASSWORD_HINT, travelerPasswordError } from '../../lib/travelerPassword';
import { GOOGLE_AUTH_ENABLED } from '../../lib/googleAuth';
import NoticeCallout from '../NoticeCallout';

export type TravelerAuthTab = 'signin' | 'signup';

type FieldKey = 'fullName' | 'email' | 'phoneNumber' | 'password' | 'form';
type FieldErrors = Partial<Record<FieldKey, string>>;

type Props = {
  idPrefix: string;
  tab: TravelerAuthTab;
  onTabChange: (tab: TravelerAuthTab) => void;
  intent?: 'checkout' | null;
  afterConfirmNext?: string;
  onAuthenticated: () => void;
  showPartnerLink?: boolean;
  destinationHint?: string | null;
  bannerError?: string | null;
};

function mapAuthError(message: string): string {
  if (message.startsWith(DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX)) return message;
  const m = message.toLowerCase();
  if (m.includes('not configured')) return 'Authentication is currently unavailable. Please try again shortly.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
    return EMAIL_ALREADY_IN_USE;
  }
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Please confirm your email before logging in.';
  if (
    m.includes('contact_phone') ||
    m.includes('phone number already exists') ||
    m.includes('consumer_profiles_contact_phone_norm_unique')
  ) {
    return 'An account with this phone number already exists. Try logging in instead.';
  }
  return 'Something went wrong. Check your details and try again.';
}

function serverMessageToFields(rawMessage: string): FieldErrors {
  const text = mapAuthError(rawMessage);
  const low = rawMessage.toLowerCase();
  if (low.includes('invalid login credentials')) return { form: text };
  if (low.includes('email not confirmed') || text.toLowerCase().includes('confirm your email')) return { email: text };
  if (
    low.includes('already registered') ||
    low.includes('already been registered') ||
    low.includes('user already exists') ||
    text === EMAIL_ALREADY_IN_USE ||
    text.startsWith(DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX)
  ) {
    return { email: text };
  }
  if (low.includes('password') && !low.includes('invalid login credentials') && !low.includes('email not confirmed')) {
    return { password: text };
  }
  if (
    low.includes('contact_phone') ||
    low.includes('phone number already exists') ||
    low.includes('consumer_profiles_contact_phone_norm_unique')
  ) {
    return { phoneNumber: text };
  }
  return { form: text };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-700" role="alert">
      {message}
    </p>
  );
}

export default function TravelerAuthForm({
  idPrefix,
  tab,
  onTabChange,
  intent = null,
  afterConfirmNext = 'account',
  onAuthenticated,
  showPartnerLink = false,
  destinationHint = null,
  bannerError = null,
}: Props) {
  const { signIn, signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [passwordResetPanel, setPasswordResetPanel] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordFieldError, setResetPasswordFieldError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);

  const clearField = (key: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key] && !prev.form) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  };

  const switchTab = (next: TravelerAuthTab) => {
    if (next === tab) return;
    onTabChange(next);
    setFieldErrors({});
    setSuccessMessage(null);
    setPasswordResetPanel(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = 'Enter your email address.';
    else if (!isValidEmailFormat(trimmedEmail)) next.email = 'Enter a valid email address.';

    if (tab === 'signup') {
      const name = splitTravelerFullName(fullName);
      if (!name.displayName) next.fullName = 'Enter your full name.';
      if (!phoneNumber.trim()) next.phoneNumber = 'Enter your phone number.';
      else if (normalizeConsumerPhone(phoneNumber).replace(/\D/g, '').length < 9) {
        next.phoneNumber = 'Enter a valid phone number.';
      }
      const passwordProblem = travelerPasswordError(password);
      if (passwordProblem) next.password = passwordProblem;
    } else if (!password) {
      next.password = 'Enter your password.';
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      if (tab === 'signin') {
        const { error: err } = await signIn(trimmedEmail, password);
        if (err) {
          setFieldErrors(serverMessageToFields(err));
          return;
        }
        // Phase 1704: session must be readable before checkout onAuthenticated resumes Pay.
        if (supabase) await supabase.auth.getSession();
        onAuthenticated();
      } else {
        const name = splitTravelerFullName(fullName);
        const { error: err, hasSession } = await signUp(trimmedEmail, password, {
          phoneNumber,
          fullName: name.displayName,
          afterConfirmNext,
        });
        if (err) {
          setFieldErrors(serverMessageToFields(err));
          return;
        }
        if (hasSession) {
          if (supabase) await supabase.auth.getSession();
          onAuthenticated();
        } else setSuccessMessage(AUTH_CONFIRMATION_EMAIL_REQUESTED);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!isValidEmailFormat(email)) {
      setFieldErrors({ email: 'Enter a valid email address, then resend confirmation.' });
      return;
    }
    setResendSending(true);
    const { error: err } = await resendTravelerConfirmation(email);
    setResendSending(false);
    if (err) {
      setFieldErrors({ form: err });
      return;
    }
    setSuccessMessage(AUTH_CONFIRMATION_EMAIL_REQUESTED);
  };

  const sendPasswordResetEmail = async (normalizedEmail: string): Promise<ForgotPasswordSendResult> => {
    if (!supabase) return { ok: false, error: 'Password reset is not configured.' };
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${publicSiteBaseUrl()}${TRAVELER_RESET_PASSWORD_PATH}?next=${encodeURIComponent(afterConfirmNext)}`,
    });
    setResetSending(false);
    if (err) return { ok: false, error: mapAuthError(err.message) };
    return { ok: true };
  };

  const title = passwordResetPanel
    ? 'Reset password'
    : tab === 'signin'
      ? 'Welcome back'
      : 'Create your Traverion account';
  const subtitle = passwordResetPanel
    ? 'We will email a reset link if an account exists for that address.'
    : intent === 'checkout' && tab === 'signin'
      ? 'Log in to continue to checkout. Your selection stays on this page.'
      : intent === 'checkout'
        ? 'Create an account to continue to checkout. Your selection stays on this page.'
        : tab === 'signin'
          ? 'Log in to continue your journey.'
          : 'Save your bookings and explore more experiences.';

  const needsResend =
    Boolean(successMessage) ||
    (fieldErrors.email ?? '').toLowerCase().includes('confirm your email') ||
    (fieldErrors.form ?? '').toLowerCase().includes('confirm your email');
  const formError = fieldErrors.form || bannerError;

  return (
    <div>
      {passwordResetPanel ? null : (
        <div className="tv-auth-tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={tab === 'signin'} onClick={() => switchTab('signin')}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={tab === 'signup'} onClick={() => switchTab('signup')}>
            Sign up
          </button>
        </div>
      )}

      <h2 id={`${idPrefix}-title`} className="font-display text-[1.65rem] leading-tight tracking-tight text-ink font-semibold">
        {title}
      </h2>
      <p className="mt-1.5 text-sm text-ink-muted leading-relaxed">{subtitle}</p>
      {destinationHint && !passwordResetPanel ? (
        <p className="mt-2 text-sm text-finland leading-relaxed">{destinationHint}</p>
      ) : null}
      {showPartnerLink && !passwordResetPanel ? (
        <p className="mt-2 text-xs text-ink-faint">
          Want to list experiences?{' '}
          <a href={supplierPortalLandingHref()} className="font-semibold text-finland hover:underline">
            Traverion Partner
          </a>
        </p>
      ) : null}

      <div className="mt-4">
        {passwordResetPanel ? (
          <ForgotPasswordInline
            title="Reset your password"
            email={resetPasswordEmail}
            onEmailChange={(value) => {
              setResetPasswordEmail(value);
              setResetPasswordFieldError(null);
            }}
            fieldError={resetPasswordFieldError}
            successMessage={resetPasswordSuccess}
            sending={resetSending}
            onSubmit={async (e) => {
              e.preventDefault();
              setResetPasswordFieldError(null);
              setResetPasswordSuccess(null);
              const trimmed = resetPasswordEmail.trim();
              if (!trimmed) {
                setResetPasswordFieldError('Enter the email address you want the reset link sent to.');
                return;
              }
              if (!isValidEmailFormat(trimmed)) {
                setResetPasswordFieldError('Enter a valid email address.');
                return;
              }
              const result = await sendPasswordResetEmail(trimmed.toLowerCase());
              if (!result.ok) {
                setResetPasswordFieldError(result.error);
                return;
              }
              setResetPasswordSuccess(AUTH_PASSWORD_RESET_REQUESTED(trimmed.toLowerCase()));
            }}
            onBack={() => {
              setPasswordResetPanel(false);
              setResetPasswordFieldError(null);
              setResetPasswordSuccess(null);
            }}
            emailInputId={`${idPrefix}-reset-email`}
            className="space-y-3"
            showHeading={false}
          />
        ) : (
          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="tv-auth-fields space-y-3">
            {formError ? (
              <NoticeCallout title="Could not continue" tone="danger">
                {formError}
              </NoticeCallout>
            ) : null}
            {successMessage ? (
              <NoticeCallout title="Check your email" tone="success">
                {successMessage}
              </NoticeCallout>
            ) : null}

            {tab === 'signup' ? (
              <div>
                <label className="tv-auth-label" htmlFor={`${idPrefix}-name`}>
                  Full name
                </label>
                <input
                  id={`${idPrefix}-name`}
                  className="tv-auth-input"
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  value={fullName}
                  aria-invalid={fieldErrors.fullName ? true : undefined}
                  aria-describedby={fieldErrors.fullName ? `${idPrefix}-name-err` : undefined}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    clearField('fullName');
                  }}
                />
                <FieldError id={`${idPrefix}-name-err`} message={fieldErrors.fullName} />
              </div>
            ) : null}

            <div>
              <label className="tv-auth-label" htmlFor={`${idPrefix}-email`}>
                Email address
              </label>
              <input
                id={`${idPrefix}-email`}
                className="tv-auth-input"
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@email.com"
                value={email}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? `${idPrefix}-email-err` : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearField('email');
                }}
              />
              <FieldError id={`${idPrefix}-email-err`} message={fieldErrors.email} />
            </div>

            {tab === 'signup' ? (
              <div>
                <label className="tv-auth-label" htmlFor={`${idPrefix}-phone`}>
                  Phone number
                </label>
                <input
                  id={`${idPrefix}-phone`}
                  className="tv-auth-input"
                  type="tel"
                  name="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+358 40 123 4567"
                  value={phoneNumber}
                  aria-invalid={fieldErrors.phoneNumber ? true : undefined}
                  aria-describedby={fieldErrors.phoneNumber ? `${idPrefix}-phone-err` : undefined}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    clearField('phoneNumber');
                  }}
                />
                <FieldError id={`${idPrefix}-phone-err`} message={fieldErrors.phoneNumber} />
              </div>
            ) : null}

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label className="tv-auth-label mb-0" htmlFor={`${idPrefix}-password`}>
                  Password
                </label>
                {tab === 'signin' ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-finland hover:underline"
                    onClick={() => {
                      setResetPasswordEmail(email.trim());
                      setResetPasswordFieldError(null);
                      setResetPasswordSuccess(null);
                      setPasswordResetPanel(true);
                    }}
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <div className="relative mt-1.5">
                <input
                  id={`${idPrefix}-password`}
                  className="tv-auth-input pr-12"
                  type={showPassword ? 'text' : 'password'}
                  name={tab === 'signup' ? 'new-password' : 'current-password'}
                  autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="Password"
                  value={password}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password
                      ? `${idPrefix}-password-err`
                      : tab === 'signup'
                        ? `${idPrefix}-password-hint`
                        : undefined
                  }
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearField('password');
                  }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted hover:text-ink"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {tab === 'signup' ? (
                <p id={`${idPrefix}-password-hint`} className="mt-1.5 text-xs text-ink-muted">
                  {TRAVELER_PASSWORD_HINT}
                </p>
              ) : null}
              <FieldError id={`${idPrefix}-password-err`} message={fieldErrors.password} />
            </div>

            {needsResend ? (
              <button
                type="button"
                className="text-sm font-semibold text-finland hover:underline disabled:opacity-50"
                disabled={resendSending}
                onClick={() => void handleResend()}
              >
                {resendSending ? 'Sending…' : 'Resend confirmation email'}
              </button>
            ) : null}

            <button type="submit" className="tv-btn-primary w-full" disabled={submitting}>
              {tab === 'signin' ? (submitting ? 'Logging in…' : 'Log in') : submitting ? 'Creating account…' : 'Create account'}
            </button>

            <div className="tv-auth-or" aria-hidden>
              <span />
              <span>OR</span>
              <span />
            </div>
            <button
              type="button"
              className="tv-auth-google"
              disabled={!GOOGLE_AUTH_ENABLED}
              aria-describedby={`${idPrefix}-google-note`}
            >
              <GoogleMark />
              Continue with Google
            </button>
            {GOOGLE_AUTH_ENABLED ? null : (
              <p id={`${idPrefix}-google-note`} className="text-center text-xs text-ink-faint">
                Coming soon. Google sign-in is not enabled yet.
              </p>
            )}
            <p className="text-center text-xs leading-relaxed text-ink-muted">
              By continuing, you log in or sign up and accept our{' '}
              <a href="/terms" className="whitespace-nowrap font-semibold text-ink underline underline-offset-2">
                Terms
              </a>{' '}
              and{' '}
              <a href="/privacy" className="whitespace-nowrap font-semibold text-ink underline underline-offset-2">
                Privacy Policy
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
