/**
 * Consumer hub: profile, trips, and saved tours, stays, and rentals.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Heart,
  ChevronRight,
  LogIn,
  LogOut,
} from 'lucide-react';
import { SkeletonFormFields, SkeletonConsumerPage } from '../components/ui/Skeleton';
import { USER_ERROR, userFacingError } from '../lib/userFacingError';
import ErrorState from '../components/ErrorState';
import { travelerLoginHref } from '../lib/travelerAuthLinks';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchMyBookings } from '../data/supabase-bookings';
import { fetchWishlistListingIds } from '../data/supabase-wishlist';
import {
  fetchConsumerProfileRow,
  saveConsumerProfile,
  normalizeConsumerPhone,
} from '../data/supabase-consumer-profile';
import { bookingAppearsInTravelerTrips } from '../lib/trip-views';
import NoticeCallout from '../components/NoticeCallout';
interface AccountPageProps {
  onNavigate: (page: string) => void;
}

/** Layer C: named Account region (MyBookings My bookings / Wishlist Saved landmark parity). */
const ACCOUNT_HEADING_ID = 'account-heading';

type HubStats = { bookings: number; wishlist: number };

function profileFieldsEqual(a: { name: string; phone: string }, b: { name: string; phone: string }) {
  return a.name.trim() === b.name.trim() && a.phone.trim() === b.phone.trim();
}

export default function AccountPage({ onNavigate }: AccountPageProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [stats, setStats] = useState<HubStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [baselineName, setBaselineName] = useState('');
  const [baselinePhone, setBaselinePhone] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const statsGenRef = useRef(0);
  const profileGenRef = useRef(0);
  const hubUserIdRef = useRef<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) {
      setStats(null);
      setStatsError(null);
      setStatsLoading(false);
      return;
    }
    const gen = ++statsGenRef.current;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const [bookings, wishlistIds] = await Promise.all([
        fetchMyBookings(),
        fetchWishlistListingIds(user.id),
      ]);
      if (gen !== statsGenRef.current) return;
      setStats({
        bookings: bookings.filter(bookingAppearsInTravelerTrips).length,
        wishlist: wishlistIds.length,
      });
    } catch (e) {
      if (gen !== statsGenRef.current) return;
      setStats(null);
      setStatsError(userFacingError(e, USER_ERROR.trips));
    } finally {
      if (gen === statsGenRef.current) setStatsLoading(false);
    }
  }, [user?.id]);

  const loadProfile = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) return;
    const gen = ++profileGenRef.current;
    setProfileLoading(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      const row = await fetchConsumerProfileRow(user.id);
      if (gen !== profileGenRef.current) return;
      const meta = user.user_metadata as {
        customer_phone?: string;
        phone?: string;
        full_name?: string;
        name?: string;
        customer_first_name?: string;
        customer_last_name?: string;
      } | undefined;
      const fallbackPhone = meta?.customer_phone ?? meta?.phone ?? '';
      const fromMeta = (
        meta?.full_name ||
        meta?.name ||
        [meta?.customer_first_name, meta?.customer_last_name].filter(Boolean).join(' ')
      ).trim();
      const resolvedName = (row?.display_name?.trim() || fromMeta || '').trim();
      const resolvedPhone = row?.contact_phone?.trim() || fallbackPhone || '';
      setDisplayName(resolvedName);
      setPhone(resolvedPhone);
      setBaselineName(resolvedName);
      setBaselinePhone(resolvedPhone);
      // Backfill empty consumer_profiles.display_name from signup metadata (existing users).
      if (user.id && fromMeta && !row?.display_name?.trim()) {
        void saveConsumerProfile(user.id, {
          displayName: fromMeta,
          phone: resolvedPhone,
        });
      }
    } catch (e) {
      if (gen !== profileGenRef.current) return;
      setProfileError(
        userFacingError(e, 'We could not load your profile. Check your connection and try again.')
      );
    } finally {
      if (gen === profileGenRef.current) setProfileLoading(false);
    }
  }, [user?.id, user?.email, user?.user_metadata]);

  // Phase 1378 + layout: clear prior hub PII before paint on account switch (useEffect ran one frame too late).
  useLayoutEffect(() => {
    if (!user?.id) {
      hubUserIdRef.current = null;
      statsGenRef.current += 1;
      profileGenRef.current += 1;
      setStats(null);
      setStatsError(null);
      setDisplayName('');
      setPhone('');
      setBaselineName('');
      setBaselinePhone('');
      setProfileMessage(null);
      setProfileError(null);
      return;
    }
    if (hubUserIdRef.current !== user.id) {
      hubUserIdRef.current = user.id;
      statsGenRef.current += 1;
      profileGenRef.current += 1;
      setStats(null);
      setStatsError(null);
      setDisplayName('');
      setPhone('');
      setBaselineName('');
      setBaselinePhone('');
      setProfileMessage(null);
      setProfileError(null);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setStatsLoading(false);
      return;
    }
    void loadStats();
    void loadProfile();
  }, [user?.id, loadStats, loadProfile]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-8">
          <header className="mb-5 rounded-[var(--tv-radius-lg,1rem)] bg-white p-4 shadow-[var(--tv-elev-1)] sm:p-5">
            <p className="tv-eyebrow">Traveler</p>
            <h1 id={ACCOUNT_HEADING_ID} className="tv-page-title">
              Account
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Account features need the live app configuration. You can still browse tours or reach support.
            </p>
          </header>
          <section aria-labelledby={ACCOUNT_HEADING_ID}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                Browse tours
              </button>
              {/* Phase 1636: stays browse parity with logged-out Account CTAs. */}
              <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                Browse stays
              </button>
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authLoading) {
      return <SkeletonConsumerPage titleWidth="w-40" form />;
    }
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-8">
          <header className="mb-5 rounded-[var(--tv-radius-lg,1rem)] bg-white p-4 shadow-[var(--tv-elev-1)] sm:p-5">
            <p className="tv-eyebrow">Traveler</p>
            <h1 id={ACCOUNT_HEADING_ID} className="tv-page-title">
              Account
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {/* Phase 1634: Saved — match Wishlist page / hub tile wording. */}
              Log in to manage trips, Saved, and your traveler profile.
            </p>
          </header>
          <section aria-labelledby={ACCOUNT_HEADING_ID}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', travelerLoginHref('account'));
                  onNavigate('auth');
                }}
                className="tv-btn-primary"
              >
                <LogIn className="w-5 h-5" />
                Log in
              </button>
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost">
                Browse tours
              </button>
              <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                Browse stays
              </button>
              {/* Phase 1676: Contact escape matches misconfigured Account state. */}
              <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                Contact support
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const badge = (n: number) =>
    statsLoading ? '…' : n > 99 ? '99+' : String(n);

  const profileDirty = !profileFieldsEqual(
    { name: displayName, phone },
    { name: baselineName, phone: baselinePhone }
  );
  const identityName = displayName.trim() || user.email || 'Traveler';
  const identityInitial = identityName.toString().trim().slice(0, 1).toUpperCase() || 'T';

  const tiles: {
    id: string;
    title: string;
    description: string;
    icon: typeof Calendar;
    count?: string;
    onClick?: () => void;
  }[] = [
    {
      id: 'bookings',
      title: 'My bookings',
      description: 'Upcoming, past, and cancelled bookings',
      icon: Calendar,
      count: stats != null ? badge(stats.bookings) : undefined,
      onClick: () => onNavigate('bookings'),
    },
    {
      id: 'wishlist',
      title: 'Saved',
      description: 'Tours, stays, and rentals you want to revisit',
      icon: Heart,
      count: stats != null ? badge(stats.wishlist) : undefined,
      onClick: () => onNavigate('wishlist'),
    },
  ];

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="tv-shell px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-12">
        <header className="tv-account-hero">
          <p className="tv-eyebrow">Traveler</p>
          <h1 id={ACCOUNT_HEADING_ID} className="tv-page-title">
            Account
          </h1>
          <div className="tv-account-identity">
            <span className="tv-account-identity__avatar" aria-hidden>
              {identityInitial}
            </span>
            <div className="min-w-0">
              <p className="tv-account-identity__name" title={identityName}>
                {identityName}
              </p>
              {displayName.trim() && user.email ? (
                <p className="tv-account-identity__email" title={user.email}>
                  {user.email}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <section aria-labelledby={ACCOUNT_HEADING_ID}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 xl:gap-12">
          <div className="min-w-0 space-y-8">
            <section>
              <h2 className="tv-section-heading mb-3.5">Your travel</h2>
              {statsError ? (
                // Phase 1635: stats cover My bookings and Saved counts.
                <ErrorState
                  className="mb-4 py-4"
                  title="Could not load your account summary"
                  body={statsError}
                  retry={{ onClick: () => void loadStats() }}
                  extra={
                    <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                      Contact support
                    </button>
                  }
                />
              ) : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {tiles.map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <li key={tile.id}>
                      <button
                        type="button"
                        onClick={tile.onClick}
                        className="lux-flat tv-account-tile group"
                      >
                        <span className="tv-account-tile__icon">
                          <Icon className="h-5 w-5" strokeWidth={1.85} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold tracking-tight text-ink">{tile.title}</span>
                            {tile.count != null ? (
                              <span className="font-sans text-sm font-bold tabular-nums tracking-tight text-[#111827]">
                                {tile.count}
                              </span>
                            ) : statsLoading ? (
                              <span className="tv-skeleton h-4 w-6 rounded" aria-hidden />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-muted">
                            {tile.description}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform motion-safe:group-hover:translate-x-0.5 group-hover:text-finland" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h2 className="tv-section-heading mb-3.5">Security</h2>
              <div className="tv-account-security">
                <button
                  type="button"
                  disabled={signingOut}
                  className="tv-account-security__btn lux-flat"
                  onClick={() => {
                    setSigningOut(true);
                    void signOut().finally(() => {
                      onNavigate('home');
                    });
                  }}
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </section>
          </div>

          <section className="min-w-0">
            <h2 className="tv-section-heading mb-3.5">Your profile</h2>
            {profileLoading ? (
              <div
                className="tv-account-panel"
                aria-busy="true"
                aria-label="Loading profile"
              >
                <SkeletonFormFields count={3} />
              </div>
            ) : profileError ? (
              <ErrorState
                className="tv-account-panel"
                title="Profile unavailable"
                body={profileError}
                retry={{ onClick: () => void loadProfile() }}
                extra={
                  <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
                    Contact support
                  </button>
                }
              />
            ) : (
              <form
                className="tv-account-panel tv-account-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!user?.id || !profileDirty || profileSaving) return;
                  setProfileSaving(true);
                  setProfileMessage(null);
                  void (async () => {
                    const digits = normalizeConsumerPhone(phone).replace(/\D/g, '');
                    if (digits.length > 0 && digits.length < 9) {
                      setProfileMessage({ kind: 'err', text: 'Enter a valid phone number (at least 9 digits), or leave it blank.' });
                      setProfileSaving(false);
                      return;
                    }
                    const res = await saveConsumerProfile(user.id, { displayName, phone });
                    setProfileSaving(false);
                    if (res.success) {
                      const nextName = displayName.trim();
                      const nextPhone = phone.trim();
                      setDisplayName(nextName);
                      setPhone(nextPhone);
                      setBaselineName(nextName);
                      setBaselinePhone(nextPhone);
                      setProfileMessage({ kind: 'ok', text: 'Profile saved.' });
                    } else {
                      setProfileMessage({ kind: 'err', text: userFacingError(res.error, 'Could not save.') });
                    }
                  })();
                }}
              >
                <div>
                  <label htmlFor="account-email" className="tv-account-form__label">
                    Email
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    value={user.email ?? ''}
                    readOnly
                    className="tv-input tv-account-form__input-readonly"
                  />
                </div>
                <div>
                  <label htmlFor="account-display-name" className="tv-account-form__label">
                    Display name
                  </label>
                  <input
                    id="account-display-name"
                    type="text"
                    name="name"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (profileMessage) setProfileMessage(null);
                    }}
                    autoComplete="name"
                    className="tv-input"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="account-phone" className="tv-account-form__label">
                    Phone <span className="font-normal text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="account-phone"
                    type="tel"
                    name="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (profileMessage) setProfileMessage(null);
                    }}
                    autoComplete="tel"
                    className="tv-input"
                    placeholder="+358 40 123 4567"
                  />
                </div>
                <div aria-live="polite">
                  {profileMessage ? (
                    <NoticeCallout
                      title={profileMessage.kind === 'ok' ? 'Saved' : 'Could not save'}
                      tone={profileMessage.kind === 'ok' ? 'success' : 'danger'}
                    >
                      {profileMessage.text}
                    </NoticeCallout>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={profileSaving || !profileDirty}
                  className="tv-btn-primary disabled:opacity-50"
                  aria-disabled={profileSaving || !profileDirty}
                >
                  {profileSaving ? 'Saving…' : 'Save profile'}
                </button>
              </form>
            )}
          </section>
        </div>
        </section>
      </div>
    </div>
  );
}
