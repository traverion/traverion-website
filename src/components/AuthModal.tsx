import { useState, useEffect, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { X, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX, EMAIL_ALREADY_IN_USE } from '../lib/customerSupplierAuthMessages';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { authInputErrorClasses, isValidEmailFormat } from '../lib/authFormValidation';
import ForgotPasswordInline, { type ForgotPasswordSendResult } from './auth/ForgotPasswordInline';
import { TRAVELER_RESET_PASSWORD_PATH } from '../lib/partnerPortalPaths';
import { AUTH_CONFIRMATION_EMAIL_REQUESTED, AUTH_PASSWORD_RESET_REQUESTED } from '../lib/booking-confirmation-copy';
import NoticeCallout from './NoticeCallout';

type Tab = 'signin' | 'signup';

type TravelerFieldKey = 'firstName' | 'lastName' | 'email' | 'phoneNumber' | 'password' | 'confirmPassword' | 'form';
type TravelerFieldErrors = Partial<Record<TravelerFieldKey, string>>;

export default function AuthModal() {
  const { authModalOpen, closeAuthModal, signIn, signUp, triggerAuthSuccess } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<TravelerFieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [passwordResetPanel, setPasswordResetPanel] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordFieldError, setResetPasswordFieldError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(authModalOpen, dialogRef, closeAuthModal);

  useEffect(() => {
    if (!authModalOpen) {
      setPasswordResetPanel(false);
      setResetPasswordEmail('');
      setResetPasswordFieldError(null);
      setResetPasswordSuccess(null);
    }
  }, [authModalOpen]);

  const mapAuthError = (message: string): string => {
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
  };

  const serverMessageToFields = (rawMessage: string): TravelerFieldErrors => {
    const text = mapAuthError(rawMessage);
    const low = rawMessage.toLowerCase();
    if (low.includes('invalid login credentials')) return { password: text };
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
    if (
      low.includes('password') &&
      !low.includes('invalid login credentials') &&
      !low.includes('email not confirmed')
    ) {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);

    const next: TravelerFieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) next.email = 'Enter your email address.';
    else if (!isValidEmailFormat(trimmedEmail)) next.email = 'Enter a valid email address.';

    if (tab === 'signup') {
      if (!firstName.trim()) next.firstName = 'Enter your first name.';
      if (!lastName.trim()) next.lastName = 'Enter your surname.';
      if (!phoneNumber.trim()) next.phoneNumber = 'Enter your phone number.';
      else if (normalizeConsumerPhone(phoneNumber).replace(/\D/g, '').length < 9) {
        next.phoneNumber = 'Enter a valid phone number.';
      }
      if (!password) next.password = 'Enter a password.';
      else if (password.length < 6) next.password = 'Use at least 6 characters.';
      if (!confirmPassword) next.confirmPassword = 'Confirm your password.';
      else if (password && confirmPassword && password !== confirmPassword) {
        next.confirmPassword = 'Passwords do not match.';
      }
    } else {
      if (!password) next.password = 'Enter your password.';
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
        triggerAuthSuccess();
      } else {
        const { error: err, hasSession } = await signUp(trimmedEmail, password, {
          phoneNumber,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          afterConfirmNext: 'account',
        });
        if (err) {
          setFieldErrors(serverMessageToFields(err));
          return;
        }
        if (hasSession) triggerAuthSuccess();
        else setSuccessMessage(AUTH_CONFIRMATION_EMAIL_REQUESTED);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sendPasswordResetEmail = async (normalizedEmail: string): Promise<ForgotPasswordSendResult> => {
    if (!supabase) return { ok: false, error: 'Password reset is not configured.' };
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${publicSiteBaseUrl()}${TRAVELER_RESET_PASSWORD_PATH}?next=account`,
    });
    setResetSending(false);
    if (err) return { ok: false, error: mapAuthError(err.message) };
    return { ok: true };
  };

  const exitModalPasswordReset = () => {
    setPasswordResetPanel(false);
    setResetPasswordEmail('');
    setResetPasswordFieldError(null);
    setResetPasswordSuccess(null);
  };

  const handleModalPasswordResetSubmit = async (e: React.FormEvent) => {
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
    const normalized = trimmed.toLowerCase();
    const result = await sendPasswordResetEmail(normalized);
    if (!result.ok) {
      setResetPasswordFieldError(result.error);
      return;
    }
    setResetPasswordSuccess(
      AUTH_PASSWORD_RESET_REQUESTED(normalized)
    );
  };

  if (!authModalOpen) return null;

  const modalTitle =
    tab === 'signin' && passwordResetPanel
      ? 'Reset password'
      : tab === 'signin'
        ? 'Log in'
        : 'Create your account';
  const modalSubtitle =
    tab === 'signin' && passwordResetPanel
      ? 'We will email a reset link if an account exists for that address.'
      : tab === 'signin'
        ? 'Manage trips, confirmations, and bookings.'
        : 'Save trips and book experiences. Takes under a minute.';

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-[2px] animate-fade-in"
      style={{ animationDuration: '0.2s' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={closeAuthModal}
    >
      <div
        className="bg-paper-raised text-ink rounded-t-2xl sm:rounded-2xl shadow-soft-xl ring-1 ring-black/[0.06] w-full max-w-md overflow-y-auto max-h-[min(92dvh,40rem)] animate-slide-up pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
        style={{ animationDelay: '40ms' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-black/[0.06] bg-gradient-to-b from-finland/[0.07] to-paper-raised px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-2">
                Traveler account
              </div>
              <h2 id="auth-modal-title" className="font-display text-2xl tracking-tight text-ink truncate">
                {modalTitle}
              </h2>
              <p className="mt-1 text-sm text-ink-muted leading-relaxed">{modalSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="lux-flat lux-tap-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-black/[0.04] hover:text-ink"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {!(tab === 'signin' && passwordResetPanel) ? (
            <>
              <div className="flex gap-1 rounded-full bg-paper p-1 w-full ring-1 ring-black/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setTab('signin');
                    setFieldErrors({});
                    setSuccessMessage(null);
                    exitModalPasswordReset();
                  }}
                  className={`lux-flat flex-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                    tab === 'signin'
                      ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                      : 'text-ink-muted hover:text-finland'
                  }`}
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('signup');
                    setFieldErrors({});
                    setSuccessMessage(null);
                    exitModalPasswordReset();
                  }}
                  className={`lux-flat flex-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                    tab === 'signup'
                      ? 'bg-finland text-white shadow-sm ring-1 ring-finland/30'
                      : 'text-ink-muted hover:text-finland'
                  }`}
                >
                  Sign up
                </button>
              </div>
              <p className="text-xs text-ink-faint leading-relaxed">
                Want to list experiences?{' '}
                <a
                  href={supplierPortalLandingHref()}
                  className="text-finland font-medium hover:underline"
                  onClick={() => closeAuthModal()}
                >
                  Traverion Partner
                </a>
              </p>
            </>
          ) : null}

          {tab === 'signin' && passwordResetPanel ? (
            <ForgotPasswordInline
              title="Reset your password"
              email={resetPasswordEmail}
              onEmailChange={(v) => {
                setResetPasswordEmail(v);
                setResetPasswordFieldError(null);
              }}
              fieldError={resetPasswordFieldError}
              successMessage={resetPasswordSuccess}
              sending={resetSending}
              onSubmit={(e) => void handleModalPasswordResetSubmit(e)}
              onBack={exitModalPasswordReset}
              emailInputId="auth-modal-forgot-reset-email"
              className="space-y-4"
            />
          ) : (
            <form noValidate onSubmit={handleSubmit} className="space-y-4">
              {fieldErrors.form ? (
                <NoticeCallout title="Could not continue" tone="danger">
                  {fieldErrors.form}
                </NoticeCallout>
              ) : null}
              {tab === 'signup' && (
                <>
                  <div>
                    <label htmlFor="auth-modal-first-name" className="block text-sm font-medium text-ink mb-1">
                      Name
                    </label>
                    <input
                      id="auth-modal-first-name"
                      type="text"
                      name="given-name"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.firstName;
                          delete n.form;
                          return n;
                        });
                      }}
                      placeholder="First name"
                      className={authInputErrorClasses(!!fieldErrors.firstName)}
                      autoComplete="given-name"
                      aria-invalid={fieldErrors.firstName ? true : undefined}
                      aria-describedby={fieldErrors.firstName ? 'auth-modal-first-name-err' : undefined}
                    />
                    {fieldErrors.firstName && (
                      <p id="auth-modal-first-name-err" className="mt-1.5 text-sm text-red-600" role="alert">
                        {fieldErrors.firstName}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="auth-modal-last-name" className="block text-sm font-medium text-ink mb-1">
                      Surname
                    </label>
                    <input
                      id="auth-modal-last-name"
                      type="text"
                      name="family-name"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.lastName;
                          delete n.form;
                          return n;
                        });
                      }}
                      placeholder="Last name"
                      className={authInputErrorClasses(!!fieldErrors.lastName)}
                      autoComplete="family-name"
                      aria-invalid={fieldErrors.lastName ? true : undefined}
                      aria-describedby={fieldErrors.lastName ? 'auth-modal-last-name-err' : undefined}
                    />
                    {fieldErrors.lastName && (
                      <p id="auth-modal-last-name-err" className="mt-1.5 text-sm text-red-600" role="alert">
                        {fieldErrors.lastName}
                      </p>
                    )}
                  </div>
                </>
              )}
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-ink mb-1">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((p) => {
                      const n = { ...p };
                      delete n.email;
                      delete n.form;
                      return n;
                    });
                  }}
                  placeholder="you@example.com"
                  className={authInputErrorClasses(!!fieldErrors.email)}
                  autoComplete="email"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? 'auth-email-err' : undefined}
                />
                {fieldErrors.email && (
                  <p id="auth-email-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.email}
                  </p>
                )}
                {tab === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetPasswordEmail(email.trim());
                      setResetPasswordFieldError(null);
                      setResetPasswordSuccess(null);
                      setPasswordResetPanel(true);
                    }}
                    className="mt-2 text-xs text-finland hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              {tab === 'signup' && (
                <div>
                  <label htmlFor="auth-phone" className="block text-sm font-medium text-ink mb-1">
                    Phone number
                  </label>
                  <input
                    id="auth-phone"
                    type="tel"
                    name="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setFieldErrors((p) => {
                        const n = { ...p };
                        delete n.phoneNumber;
                        delete n.form;
                        return n;
                      });
                    }}
                    placeholder="+358 40 123 4567"
                    className={authInputErrorClasses(!!fieldErrors.phoneNumber)}
                    autoComplete="tel"
                    aria-invalid={fieldErrors.phoneNumber ? true : undefined}
                    aria-describedby={fieldErrors.phoneNumber ? 'auth-phone-err' : undefined}
                  />
                  {fieldErrors.phoneNumber && (
                    <p id="auth-phone-err" className="mt-1.5 text-sm text-red-600" role="alert">
                      {fieldErrors.phoneNumber}
                    </p>
                  )}
                </div>
              )}
              {tab === 'signup' ? (
                <div className="rounded-2xl bg-finland/[0.04] ring-1 ring-finland/10 p-3.5 space-y-3">
                  <p className="text-xs font-medium text-finland uppercase tracking-wide">Choose a password</p>
                  <div>
                    <label htmlFor="auth-password" className="block text-xs font-medium text-ink-muted mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        name="new-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n.password;
                            delete n.form;
                            return n;
                          });
                        }}
                        placeholder="Min. 6 characters"
                        className={`${authInputErrorClasses(!!fieldErrors.password)} pr-11`}
                        autoComplete="new-password"
                        aria-invalid={fieldErrors.password ? true : undefined}
                        aria-describedby={fieldErrors.password ? 'auth-password-err' : undefined}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 lux-flat p-1.5 text-ink-muted hover:text-ink"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p id="auth-password-err" className="mt-1.5 text-sm text-red-600" role="alert">
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="auth-confirm" className="block text-xs font-medium text-ink-muted mb-1">
                      Confirm password
                    </label>
                    <div className="relative">
                      <input
                        id="auth-confirm"
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n.confirmPassword;
                            delete n.form;
                            return n;
                          });
                        }}
                        placeholder="Same as above"
                        className={`${authInputErrorClasses(!!fieldErrors.confirmPassword)} pr-11`}
                        autoComplete="new-password"
                        aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                        aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-err' : undefined}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 lux-flat p-1.5 text-ink-muted hover:text-ink"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword && (
                      <p id="auth-confirm-err" className="mt-1.5 text-sm text-red-600" role="alert">
                        {fieldErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="auth-password-signin" className="block text-sm font-medium text-ink mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password-signin"
                      type={showPassword ? 'text' : 'password'}
                      name="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.password;
                          delete n.form;
                          return n;
                        });
                      }}
                      placeholder="••••••••"
                      className={`${authInputErrorClasses(!!fieldErrors.password)} pr-11`}
                      autoComplete="current-password"
                      aria-invalid={fieldErrors.password ? true : undefined}
                      aria-describedby={fieldErrors.password ? 'auth-password-signin-err' : undefined}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 lux-flat p-1.5 text-ink-muted hover:text-ink"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p id="auth-password-signin-err" className="mt-1.5 text-sm text-red-600" role="alert">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>
              )}
              {successMessage ? (
                <NoticeCallout title="Check your email" tone="success">
                  {successMessage}
                </NoticeCallout>
              ) : null}
              <button type="submit" disabled={submitting} className="tv-btn-primary w-full">
                {tab === 'signin' ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    {submitting ? 'Logging in…' : 'Log in'}
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    {submitting ? 'Creating account…' : 'Sign up'}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
