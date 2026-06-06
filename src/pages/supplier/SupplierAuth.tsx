import { useState, useEffect } from 'react';
import { LogIn, UserPlus, Globe, Check, MapPin, Users, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ensureSupplierProfile, fetchSupplierProfile } from '../../data/supabase-supplier-profile';
import { isPhoneAvailableForSignup } from '../../data/supabase-phone-signup';
import { notifySupplierEvent } from '../../data/supabase-supplier-messaging';
import { partnerPortalAuthRedirectUrl, supplierPortalPublicBaseUrl } from '../../lib/partnerHost';
import {
  PARTNER_EMAIL_VERIFIED_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_RESET_PASSWORD_PATH,
} from '../../lib/partnerPortalPaths';
import { isSignUpEmailAlreadyRegistered } from '../../lib/supabaseAuthHelpers';
import { normalizePhoneNumber } from '../../lib/phoneNormalize';
import { subscribePasswordRecovery } from '../../lib/passwordRecoveryFlow';
import {
  DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX,
  EMAIL_ALREADY_IN_USE,
  partnerSignInTravelerOnlyEmailError,
  partnerSignUpDuplicateEmailMessage,
} from '../../lib/customerSupplierAuthMessages';
import { consumePartnerAuthFlash } from '../../lib/partnerAuthFlash';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { fetchConsumerProfile } from '../../data/supabase-consumer-profile';
import { authInputErrorClasses, isValidEmailFormat } from '../../lib/authFormValidation';
import ForgotPasswordInline, { type ForgotPasswordSendResult } from '../../components/auth/ForgotPasswordInline';

/** Fire-and-forget welcome email (Edge Function dedupes via welcome_email_sent_at). */
function sendSupplierWelcomeEmail(userId: string): void {
  void notifySupplierEvent({
    supplierId: userId,
    eventType: 'supplier_welcome',
    portalBaseUrl: supplierPortalPublicBaseUrl(),
  });
}

interface SupplierAuthProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

type Mode = 'signin' | 'signup';

type SupplierFieldKey =
  | 'email'
  | 'businessName'
  | 'phoneNumber'
  | 'password'
  | 'confirmPassword'
  | 'form';

type SupplierFieldErrors = Partial<Record<SupplierFieldKey, string>>;

const BENEFITS = [
  { icon: MapPin, text: 'List once — your tours appear on Traverion for travelers worldwide' },
  { icon: Users, text: 'No upfront cost — reach customers without listing fees' },
  { icon: CreditCard, text: 'Manage everything in one place — listings, bookings, payouts' },
];

export default function SupplierAuth({ onAuthenticated, isSupabase }: SupplierAuthProps) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SupplierFieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [passwordResetPanel, setPasswordResetPanel] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordFieldError, setResetPasswordFieldError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);
  const [resendSending, setResendSending] = useState(false);
  useEffect(() => {
    if (!isSupabase || !supabase) return;
    return subscribePasswordRecovery(supabase, () => {
      const { search, hash } = window.location;
      window.location.replace(`${PARTNER_RESET_PASSWORD_PATH}${search}${hash}`);
    });
  }, [isSupabase]);

  useEffect(() => {
    const flash = consumePartnerAuthFlash();
    if (!flash) return;
    setFieldErrors({ email: flash.message });
    setMode(flash.tab === 'signup' ? 'signup' : 'signin');
    if (flash.email) setEmail(flash.email);
    setSuccessMessage(null);
    setPasswordResetPanel(false);
  }, []);

  const mapAuthError = (message: string): string => {
    if (message.startsWith(DUPLICATE_TRAVERION_EMAIL_MESSAGE_PREFIX)) return message;
    const m = message.toLowerCase();
    if (m.includes('not configured') || m.includes('unavailable')) {
      return 'Supplier authentication is currently unavailable. Please try again shortly.';
    }
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
      return partnerSignUpDuplicateEmailMessage(`${publicSiteBaseUrl()}/log-in`);
    }
    if (m.includes('invalid login credentials')) {
      return 'Incorrect email or password.';
    }
    if (
      (m.includes('duplicate key') && m.includes('contact_phone')) ||
      m.includes('supplier_profiles_contact_phone_unique') ||
      m.includes('supplier_profiles_contact_phone_norm_unique')
    ) {
      return 'An account with this phone number already exists. Please use another phone number or sign in.';
    }
    if (m.includes('email not confirmed')) {
      return 'Please confirm your email before signing in.';
    }
    return message;
  };

  /** Map Supabase / server messages to the most relevant field (avoid generic banner-only errors). */
  const serverMessageToFields = (rawMessage: string): SupplierFieldErrors => {
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
      (low.includes('duplicate key') && low.includes('contact_phone')) ||
      low.includes('supplier_profiles_contact_phone')
    ) {
      return { phoneNumber: text };
    }
    return { form: text };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setSuccessMessage(null);

    const next: SupplierFieldErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) next.email = 'Enter your email address.';
    else if (!isValidEmailFormat(trimmedEmail)) next.email = 'Enter a valid email address.';

    if (mode === 'signup') {
      if (!businessName.trim()) next.businessName = 'Enter your registered business name.';
      if (!phoneNumber.trim()) next.phoneNumber = 'Enter your phone number.';
      else if (normalizePhoneNumber(phoneNumber).replace(/\D/g, '').length < 9) {
        next.phoneNumber = 'Enter a valid phone number.';
      }
      if (!password) next.password = 'Enter a password.';
      else if (password.length < 8) next.password = 'Use at least 8 characters.';
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
      if (isSupabase && supabase) {
        if (mode === 'signup') {
          const cleanBusinessName = businessName.trim();
          const cleanPhoneNumber = normalizePhoneNumber(phoneNumber);
          const phoneAvail = await isPhoneAvailableForSignup(phoneNumber);
          if (phoneAvail.error) {
            setFieldErrors(serverMessageToFields(phoneAvail.error));
            return;
          }
          if (!phoneAvail.available) {
            setFieldErrors({
              phoneNumber: 'An account with this phone number already exists. Please sign in instead.',
            });
            return;
          }
          const { data, error: err } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo: partnerPortalAuthRedirectUrl(PARTNER_EMAIL_VERIFIED_PATH),
              data: {
                supplier_business_name: cleanBusinessName,
                supplier_phone: cleanPhoneNumber,
              },
            },
          });
          if (err) {
            setFieldErrors(serverMessageToFields(err.message));
            return;
          }
          if (isSignUpEmailAlreadyRegistered(data.user)) {
            setFieldErrors({ email: partnerSignUpDuplicateEmailMessage(`${publicSiteBaseUrl()}/log-in`) });
            setSuccessMessage(null);
            setMode('signin');
            return;
          }
          if (data.session) {
            if (!data.user?.email_confirmed_at) {
              await supabase.auth.signOut();
              setSuccessMessage('Check your email to confirm your account, then sign in below.');
              setMode('signin');
              return;
            }
            const ensured = await ensureSupplierProfile(data.session.user.id, {
              display_name: cleanBusinessName,
              company_legal_name: cleanBusinessName,
              contact_phone: cleanPhoneNumber,
            });
            if (!ensured.success) {
              await supabase.auth.signOut();
              setFieldErrors({ form: mapAuthError(ensured.error ?? 'Could not create your supplier profile.') });
              return;
            }
            sendSupplierWelcomeEmail(data.session.user.id);
            onAuthenticated();
            return;
          }
          setSuccessMessage('Check your email to confirm your account, then sign in below.');
          setMode('signin');
        } else {
          const { data, error: err } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
          if (err) {
            setFieldErrors(serverMessageToFields(err.message));
            return;
          }
          if (data.user && !data.user.email_confirmed_at) {
            await supabase.auth.signOut();
            setFieldErrors({
              email: 'Please confirm your email before signing in.',
            });
            setSuccessMessage('You can use "Resend confirmation email" below if needed.');
            return;
          }
          if (data.user) {
            const userMeta = data.user.user_metadata as
              | { supplier_business_name?: string; supplier_phone?: string }
              | undefined;
            const travelerSignInUrl = `${publicSiteBaseUrl()}/log-in`;
            const [existingProfile, consumerRow] = await Promise.all([
              fetchSupplierProfile(data.user.id),
              fetchConsumerProfile(data.user.id),
            ]);
            if (existingProfile) {
              onAuthenticated();
              return;
            }
            if (consumerRow) {
              await supabase.auth.signOut();
              setFieldErrors({ email: partnerSignInTravelerOnlyEmailError(travelerSignInUrl) });
              setMode('signin');
              return;
            }
            const signedUpAsPartner =
              Boolean(userMeta?.supplier_business_name?.trim()) || Boolean(userMeta?.supplier_phone?.trim());
            if (!signedUpAsPartner) {
              await supabase.auth.signOut();
              setFieldErrors({ email: partnerSignInTravelerOnlyEmailError(travelerSignInUrl) });
              setMode('signin');
              return;
            }
            const ensured = await ensureSupplierProfile(data.user.id, {
              display_name: userMeta?.supplier_business_name?.trim() || normalizedEmail.split('@')[0] || null,
              company_legal_name: userMeta?.supplier_business_name?.trim() || null,
              contact_phone: normalizePhoneNumber(userMeta?.supplier_phone ?? ''),
            });
            if (!ensured.success) {
              await supabase.auth.signOut();
              setFieldErrors({ form: mapAuthError(ensured.error ?? 'Could not load your supplier profile.') });
              return;
            }
            sendSupplierWelcomeEmail(data.user.id);
            onAuthenticated();
            return;
          }
          onAuthenticated();
        }
      } else {
        setFieldErrors({
          form:
            'Sign-in can’t run here because the site isn’t connected to the account service (Supabase). ' +
            'If you’re on production, the deploy needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
            'If you’re testing locally, add them to .env and restart the dev server.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sendPasswordResetEmail = async (normalizedEmail: string): Promise<ForgotPasswordSendResult> => {
    if (!supabase) return { ok: false, error: 'Password reset is not configured.' };
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: partnerPortalAuthRedirectUrl(PARTNER_RESET_PASSWORD_PATH),
    });
    setResetSending(false);
    if (err) return { ok: false, error: mapAuthError(err.message) };
    return { ok: true };
  };

  const exitPartnerPasswordReset = () => {
    setPasswordResetPanel(false);
    setResetPasswordEmail('');
    setResetPasswordFieldError(null);
    setResetPasswordSuccess(null);
  };

  const handlePartnerPasswordResetSubmit = async (e: React.FormEvent) => {
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

  const handleResendConfirmation = async () => {
    setFieldErrors({});
    if (!email.trim()) {
      setFieldErrors({ email: 'Enter your email address, then resend confirmation.' });
      return;
    }
    if (!isValidEmailFormat(email)) {
      setFieldErrors({ email: 'Enter a valid email address.' });
      return;
    }
    if (!supabase) {
      setFieldErrors({ form: 'Email confirmation is not configured.' });
      return;
    }
    setResendSending(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo: partnerPortalAuthRedirectUrl(PARTNER_EMAIL_VERIFIED_PATH) },
    });
    setResendSending(false);
    if (err) {
      setFieldErrors(serverMessageToFields(err.message));
      return;
    }
    setSuccessMessage('Confirmation email resent. Check inbox/spam.');
  };

  return (
    <div className="w-full flex flex-col lg:flex-row lg:items-stretch xl:items-center lg:justify-between xl:justify-center gap-10 lg:gap-12 xl:gap-16 2xl:gap-20 px-0 sm:px-2 py-6 sm:py-8">
      {/* Left: value prop + benefits (GYG/Viator style) */}
      <div className="w-full lg:flex-1 lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl min-w-0">
        <div className="flex items-center gap-3 text-finland mb-4">
          <div className="w-12 h-12 rounded-xl bg-finland/10 flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
          <span className="font-semibold text-gray-900">Traverion for suppliers</span>
        </div>
        <h1 className="text-3xl sm:text-4xl xl:text-[2.5rem] font-bold text-gray-900 tracking-tight mb-4">
          List once. Reach travelers everywhere.
        </h1>
        <p className="text-base sm:text-lg text-gray-600 mb-8 max-w-prose">
          Add your tours and activities to Traverion. Get in front of travelers searching for experiences worldwide — no upfront cost.
        </p>
        <ul className="space-y-4">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-finland/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-finland" />
              </div>
              <span className="text-gray-700">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Right: Sign up / Sign in card — wider on desktop, full width on mobile */}
      <div className="w-full max-w-md sm:max-w-lg xl:max-w-xl 2xl:max-w-[28rem] mx-auto lg:mx-0 flex-shrink-0">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden xl:shadow-xl">
          <>
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setFieldErrors({});
                setSuccessMessage(null);
                exitPartnerPasswordReset();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-finland text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Create account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setFieldErrors({});
                setSuccessMessage(null);
                exitPartnerPasswordReset();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-finland text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign in
            </button>
          </div>

          {mode === 'signin' && passwordResetPanel ? (
            <ForgotPasswordInline
              title="Reset partner password"
              email={resetPasswordEmail}
              onEmailChange={(v) => {
                setResetPasswordEmail(v);
                setResetPasswordFieldError(null);
              }}
              fieldError={resetPasswordFieldError}
              successMessage={resetPasswordSuccess}
              sending={resetSending}
              onSubmit={(e) => void handlePartnerPasswordResetSubmit(e)}
              onBack={exitPartnerPasswordReset}
              emailInputId="supplier-forgot-reset-email"
            />
          ) : (
          <form noValidate onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4 sm:space-y-5">
            {fieldErrors.form && (
              <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-100" role="alert">
                {fieldErrors.form}
              </p>
            )}
            {successMessage && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="supplier-auth-email">
                Email
              </label>
              {mode === 'signup' && (
                <p className="text-xs text-gray-500 mb-2">
                  Partner login is separate from the traveler site. If this email is already used for bookings, use a
                  different address or an inbox alias (e.g. <span className="font-mono text-[11px]">you+partner@gmail.com</span>
                  ).
                </p>
              )}
              <input
                id="supplier-auth-email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.email;
                    delete next.form;
                    return next;
                  });
                }}
                placeholder="you@company.com"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 ${authInputErrorClasses(!!fieldErrors.email)}`}
                autoComplete="email"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'supplier-auth-email-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="supplier-auth-email-error" className="mt-1.5 text-sm text-red-600" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="supplier-auth-business">
                  Business name
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Use your <span className="font-medium text-gray-700">registered business name</span> as it appears on
                  official documents. Our team will verify that it matches your registration before you can go live.
                </p>
                <input
                  id="supplier-auth-business"
                  type="text"
                  name="organization"
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.businessName;
                      delete next.form;
                      return next;
                    });
                  }}
                  placeholder="Registered legal / trading name"
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 ${authInputErrorClasses(!!fieldErrors.businessName)}`}
                  autoComplete="organization"
                  aria-invalid={fieldErrors.businessName ? true : undefined}
                  aria-describedby={fieldErrors.businessName ? 'supplier-auth-business-error' : undefined}
                />
                {fieldErrors.businessName && (
                  <p id="supplier-auth-business-error" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.businessName}
                  </p>
                )}
              </div>
            )}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="supplier-auth-phone">
                  Phone number
                </label>
                <input
                  id="supplier-auth-phone"
                  type="tel"
                  name="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.phoneNumber;
                      delete next.form;
                      return next;
                    });
                  }}
                  placeholder="+358 40 123 4567"
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 ${authInputErrorClasses(!!fieldErrors.phoneNumber)}`}
                  autoComplete="tel"
                  aria-invalid={fieldErrors.phoneNumber ? true : undefined}
                  aria-describedby={fieldErrors.phoneNumber ? 'supplier-auth-phone-error' : undefined}
                />
                {fieldErrors.phoneNumber && (
                  <p id="supplier-auth-phone-error" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.phoneNumber}
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="supplier-auth-password">
                Password
              </label>
              <input
                id="supplier-auth-password"
                type="password"
                name={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.password;
                    delete next.form;
                    return next;
                  });
                }}
                placeholder="••••••••"
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 ${authInputErrorClasses(!!fieldErrors.password)}`}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? 'supplier-auth-password-error' : undefined}
              />
              {mode === 'signup' && (
                <p className="text-xs text-gray-500 mt-1">At least 8 characters</p>
              )}
              {fieldErrors.password && (
                <p id="supplier-auth-password-error" className="mt-1.5 text-sm text-red-600" role="alert">
                  {fieldErrors.password}
                </p>
              )}
              {mode === 'signin' && (
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
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="supplier-auth-confirm">
                  Confirm password
                </label>
                <input
                  id="supplier-auth-confirm"
                  type="password"
                  name="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.confirmPassword;
                      delete next.form;
                      return next;
                    });
                  }}
                  placeholder="••••••••"
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 ${authInputErrorClasses(!!fieldErrors.confirmPassword)}`}
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                  aria-describedby={fieldErrors.confirmPassword ? 'supplier-auth-confirm-error' : undefined}
                />
                {fieldErrors.confirmPassword && (
                  <p id="supplier-auth-confirm-error" className="mt-1.5 text-sm text-red-600" role="alert">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            )}
            {mode === 'signin' && successMessage && successMessage.toLowerCase().includes('confirm') && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resendSending}
                className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {resendSending ? 'Resending confirmation…' : 'Resend confirmation email'}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-finland text-white font-semibold hover:bg-finland-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {mode === 'signup' ? (
                <>
                  <UserPlus className="w-5 h-5" />
                  {submitting ? 'Creating account…' : 'Create account'}
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  {submitting ? 'Signing in…' : 'Sign in'}
                </>
              )}
            </button>
          </form>
          )}
          </>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          By continuing, you agree to list your offerings on Traverion and to our{' '}
          <a href="/termsofservice" className="text-finland font-medium hover:underline">
            partner terms of service
          </a>
          .
        </p>
      </div>
    </div>
  );
}
