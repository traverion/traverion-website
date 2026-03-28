import { useState } from 'react';
import { LogIn, UserPlus, Globe, Check, MapPin, Users, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ensureSupplierProfile } from '../../data/supabase-supplier-profile';
import { notifySupplierEvent } from '../../data/supabase-supplier-messaging';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { isSignUpEmailAlreadyRegistered } from '../../lib/supabaseAuthHelpers';
import { normalizePhoneNumber } from '../../lib/phoneNormalize';

/** Fire-and-forget welcome email (Edge Function dedupes via welcome_email_sent_at). */
function sendSupplierWelcomeEmail(userId: string): void {
  void notifySupplierEvent({
    supplierId: userId,
    eventType: 'supplier_welcome',
    portalBaseUrl: publicSiteBaseUrl(),
  });
}

interface SupplierAuthProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

type Mode = 'signin' | 'signup';

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
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resendSending, setResendSending] = useState(false);

  const mapAuthError = (message: string): string => {
    const m = message.toLowerCase();
    if (m.includes('not configured') || m.includes('unavailable')) {
      return 'Supplier authentication is currently unavailable. Please try again shortly.';
    }
    if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
      return 'This email is already in use. Try signing in instead.';
    }
    if (m.includes('invalid login credentials')) {
      return 'Incorrect email or password.';
    }
    if (
      (m.includes('duplicate key') && m.includes('contact_phone')) ||
      m.includes('supplier_profiles_contact_phone_unique')
    ) {
      return 'An account with this phone number already exists. Please use another phone number or sign in.';
    }
    if (m.includes('email not confirmed')) {
      return 'Please confirm your email before signing in.';
    }
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    if (!email || !password) return;
    if (mode === 'signup' && !businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (mode === 'signup' && !phoneNumber.trim()) {
      setError('Phone number is required');
      return;
    }
    if (mode === 'signup' && normalizePhoneNumber(phoneNumber).replace(/\D/g, '').length < 9) {
      setError('Enter a valid phone number');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (isSupabase && supabase) {
        if (mode === 'signup') {
          const cleanBusinessName = businessName.trim();
          const cleanPhoneNumber = normalizePhone(phoneNumber);
          const { data: existingPhoneRows, error: phoneCheckError } = await supabase
            .from('supplier_profiles')
            .select('id')
            .eq('contact_phone', cleanPhoneNumber)
            .limit(1);
          if (!phoneCheckError && (existingPhoneRows?.length ?? 0) > 0) {
            setError('An account with this phone number already exists. Please sign in instead.');
            return;
          }
          const { data, error: err } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo: `${publicSiteBaseUrl()}/supplier-log-in`,
              data: {
                supplier_business_name: cleanBusinessName,
                supplier_phone: cleanPhoneNumber,
              },
            },
          });
          if (err) {
            setError(mapAuthError(err.message));
            return;
          }
          if (isSignUpEmailAlreadyRegistered(data.user)) {
            setError('This email is already registered. Please sign in instead.');
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
              setError(mapAuthError(ensured.error ?? 'Could not create your supplier profile.'));
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
            setError(mapAuthError(err.message));
            return;
          }
          if (data.user && !data.user.email_confirmed_at) {
            await supabase.auth.signOut();
            setError('Please confirm your email before signing in.');
            setSuccessMessage('You can use "Resend confirmation email" below if needed.');
            return;
          }
          if (data.user) {
            const userMeta = data.user.user_metadata as
              | { supplier_business_name?: string; supplier_phone?: string }
              | undefined;
            const ensured = await ensureSupplierProfile(data.user.id, {
              display_name: userMeta?.supplier_business_name?.trim() || normalizedEmail.split('@')[0] || null,
              company_legal_name: userMeta?.supplier_business_name?.trim() || null,
              contact_phone: normalizePhoneNumber(userMeta?.supplier_phone ?? ''),
            });
            if (!ensured.success) {
              await supabase.auth.signOut();
              setError(mapAuthError(ensured.error ?? 'Could not load your supplier profile.'));
              return;
            }
            sendSupplierWelcomeEmail(data.user.id);
          }
          onAuthenticated();
        }
      } else {
        setError(
          'Sign-in can’t run here because the site isn’t connected to the account service (Supabase). ' +
            'If you’re on production, the deploy needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
            'If you’re testing locally, add them to .env and restart the dev server.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setSuccessMessage(null);
    if (!email.trim()) {
      setError('Enter your email first, then reset password.');
      return;
    }
    if (!supabase) {
      setError('Password reset is not configured.');
      return;
    }
    setResetSending(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${publicSiteBaseUrl()}/supplier-log-in`,
    });
    setResetSending(false);
    if (err) {
      setError(mapAuthError(err.message));
      return;
    }
    setSuccessMessage('Password reset email sent. Check your inbox.');
  };

  const handleResendConfirmation = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email first, then resend confirmation.');
      return;
    }
    if (!supabase) {
      setError('Email confirmation is not configured.');
      return;
    }
    setResendSending(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo: `${publicSiteBaseUrl()}/supplier-log-in` },
    });
    setResendSending(false);
    if (err) {
      setError(mapAuthError(err.message));
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
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setSuccessMessage(null); }}
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
              onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
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

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4 sm:space-y-5">
            {successMessage && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                autoComplete="email"
                required
              />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
                <input
                  type="text"
                  name="organization"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your company / operator name"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  autoComplete="organization"
                  required
                />
              </div>
            )}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                <input
                  type="tel"
                  name="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+358 40 123 4567"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  autoComplete="tel"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                name={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                required
                minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              {mode === 'signup' && (
                <p className="text-xs text-gray-500 mt-1">At least 8 characters</p>
              )}
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetSending}
                  className="mt-2 text-xs text-finland hover:underline disabled:opacity-50"
                >
                  {resetSending ? 'Sending reset email…' : 'Forgot password?'}
                </button>
              )}
            </div>
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  name="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-finland focus:border-finland"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
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
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          By continuing, you agree to list your offerings on Traverion and to our terms of use.
        </p>
      </div>
    </div>
  );
}
