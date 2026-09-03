import { useState, useEffect } from 'react';
import { X, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeConsumerPhone } from '../data/supabase-consumer-profile';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX, EMAIL_ALREADY_IN_USE } from '../lib/customerSupplierAuthMessages';
import { supplierPortalHref } from '../lib/partnerHost';
import { authInputErrorClasses, isValidEmailFormat } from '../lib/authFormValidation';
import ForgotPasswordInline, { type ForgotPasswordSendResult } from './auth/ForgotPasswordInline';
import { TRAVELER_RESET_PASSWORD_PATH } from '../lib/partnerPortalPaths';

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
    return message;
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
        else setSuccessMessage('Check your email to confirm your account, then log in.');
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
      `If an account exists for ${normalized}, you will get an email with a link to reset your password. Check spam too.`
    );
  };

  if (!authModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] animate-fade-in"
      style={{ animationDuration: '0.2s' }}
      role="dialog"
      aria-modal="true"
      aria-label="Log in or sign up"
      onClick={closeAuthModal}
    >
      <div
        className="bg-white rounded-2xl shadow-soft-xl w-full max-w-md overflow-hidden animate-slide-up"
        style={{ animationDelay: '40ms' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain flex-shrink-0" />
            <h2 className="text-xl font-semibold text-gray-900 truncate">
              {tab === 'signin' && passwordResetPanel ? 'Reset your password' : tab === 'signin' ? 'Log in' : 'Sign up'}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors duration-200 ease-smooth active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-100">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setFieldErrors({});
              setSuccessMessage(null);
              exitModalPasswordReset();
            }}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              tab === 'signin'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-500 hover:text-gray-700'
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
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              tab === 'signup'
                ? 'text-gray-900 border-b-2 border-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sign up
          </button>
        </div>

        {!(tab === 'signin' && passwordResetPanel) && (
        <p className="px-6 pt-3 pb-1 text-xs text-gray-500 leading-relaxed border-b border-gray-50">
          Traveler account — bookings and saved trips, not the partner dashboard. Want to be a supplier?{' '}
          <a
            href={supplierPortalHref('/login')}
            className="text-finland font-medium hover:underline"
            onClick={() => closeAuthModal()}
          >
            Join here
          </a>
        </p>
        )}

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
                <label htmlFor="auth-modal-first-name" className="block text-sm font-medium text-gray-700 mb-1">
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow ${authInputErrorClasses(!!fieldErrors.firstName)}`}
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
                <label htmlFor="auth-modal-last-name" className="block text-sm font-medium text-gray-700 mb-1">
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow ${authInputErrorClasses(!!fieldErrors.lastName)}`}
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
            <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-1">
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
              className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow ${authInputErrorClasses(!!fieldErrors.email)}`}
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
              <label htmlFor="auth-phone" className="block text-sm font-medium text-gray-700 mb-1">
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
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow ${authInputErrorClasses(!!fieldErrors.phoneNumber)}`}
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
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 space-y-2">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Choose a password</p>
              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-gray-600 mb-1">
                  Password
                </label>
                <input
                  id="auth-password"
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow bg-white ${authInputErrorClasses(!!fieldErrors.password)}`}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? 'auth-password-err' : undefined}
                />
                {fieldErrors.password && (
                  <p id="auth-password-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="auth-confirm" className="block text-xs font-medium text-gray-600 mb-1">
                  Confirm password
                </label>
                <input
                  id="auth-confirm"
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow bg-white ${authInputErrorClasses(!!fieldErrors.confirmPassword)}`}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                  aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-err' : undefined}
                />
                {fieldErrors.confirmPassword && (
                  <p id="auth-confirm-err" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="auth-password-signin" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="auth-password-signin"
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
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 outline-none transition-shadow ${authInputErrorClasses(!!fieldErrors.password)}`}
                autoComplete="current-password"
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? 'auth-password-signin-err' : undefined}
              />
              {fieldErrors.password && (
                <p id="auth-password-signin-err" className="mt-1.5 text-sm text-red-600" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>
          )}
          {successMessage && (
            <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">{successMessage}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60"
          >
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
  );
}
