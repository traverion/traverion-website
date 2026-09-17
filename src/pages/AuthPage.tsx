import { useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, LogIn, UserPlus, Mail, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { subscribePasswordRecovery } from '../lib/passwordRecoveryFlow';
import { DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX, EMAIL_ALREADY_IN_USE } from '../lib/customerSupplierAuthMessages';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { authInputErrorClasses, isValidEmailFormat } from '../lib/authFormValidation';
import ForgotPasswordInline, { type ForgotPasswordSendResult } from '../components/auth/ForgotPasswordInline';
import { TRAVELER_RESET_PASSWORD_PATH } from '../lib/partnerPortalPaths';
import { sanitizeTravelerAuthNext } from '../lib/travelerAuthLinks';
import { AUTH_CONFIRMATION_EMAIL_REQUESTED, AUTH_PASSWORD_RESET_REQUESTED } from '../lib/booking-confirmation-copy';
import { HERO_IMG } from '../lib/heroImages';
import NoticeCallout from '../components/NoticeCallout';
import SkipLink from '../components/SkipLink';

type AuthTab = 'signin' | 'signup';

type TravelerPageFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phoneNumber'
  | 'password'
  | 'confirmPassword'
  | 'form';
type TravelerPageFieldErrors = Partial<Record<TravelerPageFieldKey, string>>;

interface AuthPageProps {
  onNavigate: (page: string) => void;
}

function readAuthQuery(): { tab: AuthTab; next: string } {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  let tab: AuthTab = 'signup';
  if (path === '/log-in' || path === '/login') tab = 'signin';
  else if (path === '/sign-up') tab = 'signup';
  else if (tabParam === 'signin') tab = 'signin';
  const nextParam = params.get('next');
  return {
    tab,
    next: sanitizeTravelerAuthNext(nextParam),
  };
}

export default function AuthPage({ onNavigate }: AuthPageProps) {
  const { signIn, signUp } = useAuth();
  const [{ tab: initialTab, next }] = useState(readAuthQuery);
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<TravelerPageFieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [passwordResetPanel, setPasswordResetPanel] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordFieldError, setResetPasswordFieldError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);
  const [resendSending, setResendSending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    return subscribePasswordRecovery(supabase, () => {
      const { search, hash } = window.location;
      window.location.replace(`${TRAVELER_RESET_PASSWORD_PATH}${search}${hash}`);
    });
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('traverion_auth_flash');
      if (!raw) return;
      sessionStorage.removeItem('traverion_auth_flash');
      const parsed = JSON.parse(raw) as { kind?: string; message?: string };
      if (parsed?.kind === 'error' && typeof parsed.message === 'string') {
        setFieldErrors({ form: parsed.message });
        setTab('signin');
        setPasswordResetPanel(false);
      }
    } catch {
      sessionStorage.removeItem('traverion_auth_flash');
    }
  }, []);

  const mapAuthError = (message: string): string => {
    if (message.startsWith(DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX)) return message;
    const m = message.toLowerCase();
    if (m.includes('not configured')) return 'Authentication is currently unavailable. Please try again shortly.';
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
      return EMAIL_ALREADY_IN_USE;
    }
    if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.';
    if (
      m.includes('contact_phone') ||
      m.includes('phone number already exists') ||
      m.includes('consumer_profiles_contact_phone_norm_unique')
    ) {
      return 'An account with this phone number already exists. Try signing in instead.';
    }
    return 'Something went wrong. Check your details and try again.';
  };

  const serverMessageToFields = (rawMessage: string): TravelerPageFieldErrors => {
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

  const nextPage = useMemo(() => sanitizeTravelerAuthNext(next), [next]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('next', nextPage);
    const path = tab === 'signup' ? '/sign-up' : '/log-in';
    window.history.replaceState({}, '', `${path}?${params.toString()}`);
  }, [tab, nextPage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);

    const next: TravelerPageFieldErrors = {};
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
    const normalizedEmail = trimmedEmail.toLowerCase();
    try {
      if (tab === 'signin') {
        const { error: err } = await signIn(normalizedEmail, password);
        if (err) {
          setFieldErrors(serverMessageToFields(err));
          return;
        }
        onNavigate(nextPage);
      } else {
        const { error: err, hasSession } = await signUp(normalizedEmail, password, {
          phoneNumber,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          afterConfirmNext: nextPage,
        });
        if (err) {
          setFieldErrors(serverMessageToFields(err));
          return;
        }
        if (hasSession) {
          onNavigate(nextPage);
        } else {
          setSuccessMessage(AUTH_CONFIRMATION_EMAIL_REQUESTED);
          setTab('signin');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = useCallback(async () => {
    setFieldErrors({});
    setSuccessMessage(null);
    if (!email.trim()) {
      setFieldErrors({ email: 'Enter your email address, then resend confirmation.' });
      return;
    }
    if (!isValidEmailFormat(email)) {
      setFieldErrors({ email: 'Enter a valid email address.' });
      return;
    }
    if (!supabase) {
      setFieldErrors({ form: 'Authentication is not configured.' });
      return;
    }
    setResendSending(true);
    const confirmQs = new URLSearchParams({ next: nextPage }).toString();
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${publicSiteBaseUrl()}/email-confirmed?${confirmQs}` },
    });
    setResendSending(false);
    if (err) {
      setFieldErrors(serverMessageToFields(err.message));
      return;
    }
    setSuccessMessage(AUTH_CONFIRMATION_EMAIL_REQUESTED);
  }, [email, nextPage]);

  const sendPasswordResetEmail = async (normalizedEmail: string): Promise<ForgotPasswordSendResult> => {
    if (!supabase) return { ok: false, error: 'Password reset is not configured.' };
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${publicSiteBaseUrl()}${TRAVELER_RESET_PASSWORD_PATH}?next=${encodeURIComponent(nextPage)}`,
    });
    setResetSending(false);
    if (err) return { ok: false, error: mapAuthError(err.message) };
    return { ok: true };
  };

  const exitTravelerPasswordReset = () => {
    setPasswordResetPanel(false);
    setResetPasswordEmail('');
    setResetPasswordFieldError(null);
    setResetPasswordSuccess(null);
  };

  const handleTravelerPasswordResetSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col lg:flex-row">
      <SkipLink />
      <aside className="relative isolate overflow-hidden lg:w-[44%] lg:min-h-[100dvh] lg:sticky lg:top-0 lg:self-start">
        <div className="relative h-44 sm:h-52 lg:h-[100dvh] min-h-[11rem]">
          <img
            src={HERO_IMG.vacation}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            width={1200}
            height={1600}
            decoding="async"
            fetchPriority="high"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-finland-dark/85 via-finland/35 to-ink/20 lg:bg-gradient-to-br lg:from-finland-dark/75 lg:via-finland/30 lg:to-ink/25"
            aria-hidden
          />
          <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-8 lg:p-10">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('home');
              }}
              className="flex items-center gap-2.5 no-lux-interaction w-fit"
              aria-label="Traverion home"
            >
              <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain brightness-0 invert" />
              <span className="font-sans text-sm font-semibold tracking-[0.18em] text-white">TRAVERION</span>
            </a>
            <div className="max-w-sm pb-1 lg:pb-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 mb-2">For travelers</p>
              <p className="font-display text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight leading-tight">
                Book with operators. Manage every trip in one place.
              </p>
              <p className="mt-3 text-sm text-white/80 leading-relaxed hidden sm:block">
                Confirmations, pickup details, and cancellations — not a brochure login.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-none">
        <div className="flex-1 px-5 sm:px-8 py-8 sm:py-12 pb-16">
          <div className="mx-auto w-full max-w-md">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="lux-flat mb-6 inline-flex items-center gap-2 text-ink-muted hover:text-ink lg:mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Traverion
            </button>

            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft-lg ring-1 ring-black/[0.06]">
              <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
                Traveler account
              </div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-ink mb-2">
                {passwordResetPanel
                  ? 'Reset password'
                  : tab === 'signin'
                    ? 'Log in'
                    : 'Create your account'}
              </h1>
              <p className="text-sm text-ink-muted mb-2 leading-relaxed">
                {passwordResetPanel
                  ? 'We will email a reset link if an account exists for that address.'
                  : tab === 'signin'
                    ? 'Manage trips, confirmations, and bookings.'
                    : 'Save trips and book experiences. Takes under a minute.'}
              </p>
              <p className="text-xs text-ink-faint mb-6">
                Want to list experiences?{' '}
                <a href={supplierPortalLandingHref()} className="text-finland font-medium hover:underline">
                  Traverion Partner
                </a>
              </p>

              {!passwordResetPanel ? (
                <div className="flex gap-1 rounded-full bg-black/[0.04] p-1 mb-6 w-full sm:w-fit">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signin');
                      setFieldErrors({});
                      setSuccessMessage(null);
                      exitTravelerPasswordReset();
                    }}
                    className={`lux-flat flex-1 sm:flex-none rounded-full px-3.5 py-1.5 text-sm font-medium ${
                      tab === 'signin' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-muted'
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
                      exitTravelerPasswordReset();
                    }}
                    className={`lux-flat flex-1 sm:flex-none rounded-full px-3.5 py-1.5 text-sm font-medium ${
                      tab === 'signup' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-muted'
                    }`}
                  >
                    Sign up
                  </button>
                </div>
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
                  onSubmit={(e) => void handleTravelerPasswordResetSubmit(e)}
                  onBack={exitTravelerPasswordReset}
                  emailInputId="auth-page-forgot-reset-email"
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
                        <label htmlFor="auth-page-first-name" className="block text-sm font-medium text-ink mb-1">
                          Name
                        </label>
                        <input
                          id="auth-page-first-name"
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
                          aria-describedby={fieldErrors.firstName ? 'auth-page-first-name-err' : undefined}
                        />
                        {fieldErrors.firstName && (
                          <p id="auth-page-first-name-err" className="mt-1.5 text-sm text-red-600" role="alert">
                            {fieldErrors.firstName}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="auth-page-last-name" className="block text-sm font-medium text-ink mb-1">
                          Surname
                        </label>
                        <input
                          id="auth-page-last-name"
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
                          aria-describedby={fieldErrors.lastName ? 'auth-page-last-name-err' : undefined}
                        />
                        {fieldErrors.lastName && (
                          <p id="auth-page-last-name-err" className="mt-1.5 text-sm text-red-600" role="alert">
                            {fieldErrors.lastName}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  <div>
                    <label htmlFor="auth-page-email" className="block text-sm font-medium text-ink mb-1">
                      Email
                    </label>
                    <input
                      id="auth-page-email"
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
                      aria-describedby={fieldErrors.email ? 'auth-page-email-err' : undefined}
                    />
                    {fieldErrors.email && (
                      <p id="auth-page-email-err" className="mt-1.5 text-sm text-red-600" role="alert">
                        {fieldErrors.email}
                      </p>
                    )}
                    {tab === 'signin' && (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        <button
                          type="button"
                          onClick={handleResendConfirmation}
                          disabled={resendSending}
                          className="text-xs text-finland hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          {resendSending ? 'Sending…' : 'Resend confirmation email'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetPasswordEmail(email.trim());
                            setResetPasswordFieldError(null);
                            setResetPasswordSuccess(null);
                            setPasswordResetPanel(true);
                          }}
                          className="text-xs text-finland hover:underline disabled:opacity-50"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                  {tab === 'signup' && (
                    <div>
                      <label htmlFor="auth-page-phone" className="block text-sm font-medium text-ink mb-1">
                        Phone number
                      </label>
                      <input
                        id="auth-page-phone"
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
                        aria-describedby={fieldErrors.phoneNumber ? 'auth-page-phone-err' : undefined}
                      />
                      {fieldErrors.phoneNumber && (
                        <p id="auth-page-phone-err" className="mt-1.5 text-sm text-red-600" role="alert">
                          {fieldErrors.phoneNumber}
                        </p>
                      )}
                    </div>
                  )}
                  {tab === 'signup' ? (
                    <div className="rounded-2xl bg-finland/[0.04] ring-1 ring-finland/10 p-3.5 space-y-3">
                      <p className="text-xs font-medium text-finland uppercase tracking-wide">Choose a password</p>
                      <div>
                        <label htmlFor="auth-page-password" className="block text-xs font-medium text-ink-muted mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-page-password"
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
                            aria-describedby={fieldErrors.password ? 'auth-page-password-err' : undefined}
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
                          <p id="auth-page-password-err" className="mt-1.5 text-sm text-red-600" role="alert">
                            {fieldErrors.password}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="auth-page-confirm" className="block text-xs font-medium text-ink-muted mb-1">
                          Confirm password
                        </label>
                        <div className="relative">
                          <input
                            id="auth-page-confirm"
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
                            aria-describedby={fieldErrors.confirmPassword ? 'auth-page-confirm-err' : undefined}
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
                          <p id="auth-page-confirm-err" className="mt-1.5 text-sm text-red-600" role="alert">
                            {fieldErrors.confirmPassword}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="auth-page-password-signin" className="block text-sm font-medium text-ink mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="auth-page-password-signin"
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
                          aria-describedby={fieldErrors.password ? 'auth-page-password-signin-err' : undefined}
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
                        <p id="auth-page-password-signin-err" className="mt-1.5 text-sm text-red-600" role="alert">
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
                        {submitting ? 'Signing in…' : 'Sign in'}
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        {submitting ? 'Creating account…' : 'Create account'}
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
