import { useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, LogIn, UserPlus, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import { HERO_IMG } from '../lib/heroImages';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { subscribePasswordRecovery, updatePasswordAfterRecovery } from '../lib/passwordRecoveryFlow';
import { DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX, EMAIL_ALREADY_IN_USE } from '../lib/customerSupplierAuthMessages';
import { supplierPortalHref } from '../lib/partnerHost';
import { authInputErrorClasses, isValidEmailFormat } from '../lib/authFormValidation';
import ForgotPasswordInline, { type ForgotPasswordSendResult } from '../components/auth/ForgotPasswordInline';

type AuthTab = 'signin' | 'signup';

type TravelerPageFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phoneNumber'
  | 'password'
  | 'confirmPassword'
  | 'recoveryPassword'
  | 'recoveryConfirm'
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
  if (path === '/log-in') tab = 'signin';
  else if (path === '/sign-up') tab = 'signup';
  else if (tabParam === 'signin') tab = 'signin';
  const nextParam = params.get('next');
  return {
    tab,
    next: nextParam || 'cart',
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
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    return subscribePasswordRecovery(supabase, () => setRecoveryMode(true));
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
    return message;
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

  const nextPage = useMemo(() => {
    const allowed = new Set([
      'home',
      'packages',
      'cart',
      'bookings',
      'booking-confirmed',
      'account',
      'wishlist',
      'contact',
    ]);
    return allowed.has(next) ? next : 'cart';
  }, [next]);

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
          setSuccessMessage('Check your email to confirm your account, then sign in.');
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
    setSuccessMessage('Confirmation email sent. Check your inbox and use the new link.');
  }, [email, nextPage]);

  const sendPasswordResetEmail = async (normalizedEmail: string): Promise<ForgotPasswordSendResult> => {
    if (!supabase) return { ok: false, error: 'Password reset is not configured.' };
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${publicSiteBaseUrl()}/log-in?next=${encodeURIComponent(nextPage)}`,
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
      `If an account exists for ${normalized}, you will get an email with a link to reset your password. Check spam too.`
    );
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);
    if (!supabase) return;
    const rec: TravelerPageFieldErrors = {};
    if (!recoveryPassword) rec.recoveryPassword = 'Enter a new password.';
    else if (recoveryPassword.length < 6) rec.recoveryPassword = 'Use at least 6 characters.';
    if (!recoveryConfirm) rec.recoveryConfirm = 'Confirm your new password.';
    else if (recoveryPassword && recoveryConfirm && recoveryPassword !== recoveryConfirm) {
      rec.recoveryConfirm = 'Passwords do not match.';
    }
    if (Object.keys(rec).length > 0) {
      setFieldErrors(rec);
      return;
    }
    setRecoverySubmitting(true);
    try {
      const { error: err } = await updatePasswordAfterRecovery(supabase, recoveryPassword, { minLength: 6 });
      if (err) {
        setFieldErrors({ recoveryPassword: mapAuthError(err) });
        return;
      }
      await supabase.auth.signOut();
      setRecoveryMode(false);
      setRecoveryPassword('');
      setRecoveryConfirm('');
      setTab('signin');
      setSuccessMessage('Your password was updated. Sign in with your new password.');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen pt-20">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{
            backgroundImage: `url(${HERO_IMG.vacation})`,
            filter: 'blur(12px)',
          }}
        />
        <div className="absolute inset-0 bg-white/55" />
      </div>
      <div className="max-w-md mx-auto px-4 py-8 pb-12">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="mb-5 inline-flex items-center gap-2 text-gray-600 hover:text-finland"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 sm:h-14 sm:w-14 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-gray-900">
                  {recoveryMode ? 'Set a new password' : tab === 'signin' ? 'Sign in' : 'Sign up'}
                </h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  {recoveryMode
                    ? 'Choose a new password for your account, then sign in.'
                    : 'Book trips, save your cart, and manage bookings — not the partner dashboard.'}
                </p>
                {!recoveryMode && (
                  <p className="text-xs text-gray-500 mt-2">
                    Want to be a supplier?{' '}
                    <a href={supplierPortalHref('/login')} className="text-finland font-medium hover:underline">
                      Join here
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>

          {recoveryMode ? (
            <form noValidate onSubmit={(e) => void handleRecoverySubmit(e)} className="p-6 space-y-4">
              <div>
                <label htmlFor="auth-recovery-password" className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <input
                  id="auth-recovery-password"
                  type="password"
                  name="new-password"
                  value={recoveryPassword}
                  onChange={(e) => {
                    setRecoveryPassword(e.target.value);
                    setFieldErrors((p) => {
                      const n = { ...p };
                      delete n.recoveryPassword;
                      delete n.form;
                      return n;
                    });
                  }}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.recoveryPassword)}`}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.recoveryPassword ? true : undefined}
                  aria-describedby={fieldErrors.recoveryPassword ? 'auth-recovery-password-err' : undefined}
                />
                {fieldErrors.recoveryPassword && (
                  <p id="auth-recovery-password-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.recoveryPassword}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="auth-recovery-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm new password
                </label>
                <input
                  id="auth-recovery-confirm"
                  type="password"
                  name="confirm-password"
                  value={recoveryConfirm}
                  onChange={(e) => {
                    setRecoveryConfirm(e.target.value);
                    setFieldErrors((p) => {
                      const n = { ...p };
                      delete n.recoveryConfirm;
                      delete n.form;
                      return n;
                    });
                  }}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.recoveryConfirm)}`}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.recoveryConfirm ? true : undefined}
                  aria-describedby={fieldErrors.recoveryConfirm ? 'auth-recovery-confirm-err' : undefined}
                />
                {fieldErrors.recoveryConfirm && (
                  <p id="auth-recovery-confirm-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.recoveryConfirm}
                  </p>
                )}
              </div>
              {successMessage && (
                <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{successMessage}</p>
              )}
              <button
                type="submit"
                disabled={recoverySubmitting}
                className="w-full py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors disabled:opacity-60"
              >
                {recoverySubmitting ? 'Saving…' : 'Update password'}
              </button>
            </form>
          ) : (
            <>
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setFieldErrors({});
                setSuccessMessage(null);
                exitTravelerPasswordReset();
              }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'signin' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setFieldErrors({});
                setSuccessMessage(null);
                exitTravelerPasswordReset();
              }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === 'signup' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign up
            </button>
          </div>

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
              className="p-6 space-y-4"
            />
          ) : (
          <form noValidate onSubmit={handleSubmit} className="p-6 space-y-4">
            {fieldErrors.form && (
              <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100" role="alert">
                {fieldErrors.form}
              </p>
            )}
            {tab === 'signup' && (
              <>
                <div>
                  <label htmlFor="auth-page-first-name" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.firstName)}`}
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
                  <label htmlFor="auth-page-last-name" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.lastName)}`}
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
              <label htmlFor="auth-page-email" className="block text-sm font-medium text-gray-700 mb-1">
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
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.email)}`}
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
                <label htmlFor="auth-page-phone" className="block text-sm font-medium text-gray-700 mb-1">
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.phoneNumber)}`}
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
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 space-y-2">
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Choose a password</p>
                <div>
                  <label htmlFor="auth-page-password" className="block text-xs font-medium text-gray-600 mb-1">
                    Password
                  </label>
                  <input
                    id="auth-page-password"
                    type="password"
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
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none bg-white ${authInputErrorClasses(!!fieldErrors.password)}`}
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={fieldErrors.password ? 'auth-page-password-err' : undefined}
                  />
                  {fieldErrors.password && (
                    <p id="auth-page-password-err" className="mt-1.5 text-sm text-red-600" role="alert">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="auth-page-confirm" className="block text-xs font-medium text-gray-600 mb-1">
                    Confirm password
                  </label>
                  <input
                    id="auth-page-confirm"
                    type="password"
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
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none bg-white ${authInputErrorClasses(!!fieldErrors.confirmPassword)}`}
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                    aria-describedby={fieldErrors.confirmPassword ? 'auth-page-confirm-err' : undefined}
                  />
                  {fieldErrors.confirmPassword && (
                    <p id="auth-page-confirm-err" className="mt-1.5 text-sm text-red-600" role="alert">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="auth-page-password-signin" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="auth-page-password-signin"
                  type="password"
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none ${authInputErrorClasses(!!fieldErrors.password)}`}
                  autoComplete="current-password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? 'auth-page-password-signin-err' : undefined}
                />
                {fieldErrors.password && (
                  <p id="auth-page-password-signin-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            )}
            {successMessage && <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{successMessage}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
