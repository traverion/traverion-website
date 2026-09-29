/**
 * Consumer hub: profile, trips, and saved tours and stays.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Heart,
  ChevronRight,
  LogIn,
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

/** Layer C: named Account region (MyBookings Trips / Wishlist Saved landmark parity). */
const ACCOUNT_HEADING_ID = 'account-heading';

type HubStats = { bookings: number; wishlist: number };

export default function AccountPage({ onNavigate }: AccountPageProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [stats, setStats] = useState<HubStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
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
      setDisplayName(resolvedName);
      setPhone(row?.contact_phone?.trim() || fallbackPhone || '');
      // Backfill empty consumer_profiles.display_name from signup metadata (existing users).
      if (user.id && fromMeta && !row?.display_name?.trim()) {
        void saveConsumerProfile(user.id, {
          displayName: fromMeta,
          phone: row?.contact_phone?.trim() || fallbackPhone || '',
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
          <header className="mb-5 tv-card p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Traveler</p>
            <h1 id={ACCOUNT_HEADING_ID} className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
              Account
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
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
          <header className="mb-5 tv-card p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Traveler</p>
            <h1 id={ACCOUNT_HEADING_ID} className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
              Account
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
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
      title: 'Trips',
      description: 'Upcoming, past, and cancelled bookings',
      icon: Calendar,
      count: stats != null ? badge(stats.bookings) : undefined,
      onClick: () => onNavigate('bookings'),
    },
    {
      id: 'wishlist',
      title: 'Saved',
      description: 'Tours and stays you want to revisit',
      icon: Heart,
      count: stats != null ? badge(stats.wishlist) : undefined,
      onClick: () => onNavigate('wishlist'),
    },
  ];

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-14">
        <header className="mb-8 sm:mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Traveler</p>
          <h1
            id={ACCOUNT_HEADING_ID}
            className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] text-ink tracking-tight"
          >
            Account
          </h1>
          <p className="mt-2 max-w-2xl break-words text-base text-ink-muted [overflow-wrap:anywhere]" title={user.email ?? undefined}>
            {displayName.trim() || user.email}
          </p>
          {displayName.trim() && user.email ? (
            <p className="mt-0.5 break-all text-sm text-ink-faint [overflow-wrap:anywhere]">{user.email}</p>
          ) : null}
        </header>

        <section aria-labelledby={ACCOUNT_HEADING_ID}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 xl:gap-16">
          <div className="min-w-0 space-y-10">
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-3">Your travel</h2>
              {statsError ? (
                // Phase 1635: stats cover Trips and Saved counts.
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
              <ul className="grid gap-2 sm:grid-cols-2">
                {tiles.map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <li key={tile.id}>
                      <button
                        type="button"
                        onClick={tile.onClick}
                        className="lux-flat group flex w-full min-h-[4.25rem] items-center gap-3 rounded-2xl bg-paper-raised px-4 py-3.5 text-left ring-1 ring-black/[0.06] hover:ring-finland/25 shadow-soft"
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                            tile.id === 'wishlist'
                              ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-100'
                              : 'bg-finland/[0.08] text-finland ring-1 ring-finland/15'
                          }`}
                        >
                          <Icon className="w-5 h-5" strokeWidth={tile.id === 'wishlist' ? 2 : 1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink">{tile.title}</span>
                            {tile.count != null ? (
                              <span className="text-sm tabular-nums font-semibold text-ink-muted">{tile.count}</span>
                            ) : statsLoading ? (
                              <span className="h-4 w-6 animate-pulse rounded bg-black/[0.06]" aria-hidden />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-muted">{tile.description}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-finland" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-ink-muted leading-relaxed max-w-lg">
                Messages with hosts live on each trip — open{' '}
                <button type="button" onClick={() => onNavigate('bookings')} className="font-semibold text-finland hover:underline">
                  Trips
                </button>{' '}
                to read and reply.
              </p>
            </section>

            <section className="rounded-2xl bg-paper-raised p-5 sm:p-6 ring-1 ring-black/[0.06]">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">Security</h2>
              <p className="text-sm text-ink-muted leading-relaxed max-w-lg">
                You are signed in as this traveler. Signing out does not change bookings.
              </p>
              <button
                type="button"
                disabled={signingOut}
                className="tv-btn-secondary mt-4 disabled:opacity-50"
                onClick={() => {
                  setSigningOut(true);
                  void signOut().finally(() => {
                    onNavigate('home');
                  });
                }}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </section>

            <p className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost -ml-2">
                Browse tours
              </button>
              {/* Phase 1636: signed-in hub also offers stays. */}
              <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                Browse stays
              </button>
            </p>
          </div>

          <section className="min-w-0">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-4">Your profile</h2>
            {profileLoading ? (
              <div
                className="rounded-2xl bg-paper-raised p-5 sm:p-6 ring-1 ring-black/[0.06]"
                aria-busy="true"
                aria-label="Loading profile"
              >
                <SkeletonFormFields count={3} />
              </div>
            ) : profileError ? (
              <ErrorState
                className="rounded-2xl bg-paper-raised p-5 sm:p-6 ring-1 ring-black/[0.06]"
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
                className="space-y-4 rounded-2xl bg-paper-raised p-5 sm:p-6 ring-1 ring-black/[0.06] shadow-soft"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!user?.id) return;
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
                      setProfileMessage({ kind: 'ok', text: 'Profile saved.' });
                      await loadProfile();
                    } else {
                      setProfileMessage({ kind: 'err', text: userFacingError(res.error, 'Could not save.') });
                    }
                  })();
                }}
              >
                <div>
                  <label htmlFor="account-email" className="block text-sm font-medium text-ink mb-1">
                    Email
                  </label>
                  <input
                    id="account-email"
                    type="email"
                    value={user.email ?? ''}
                    readOnly
                    className="tv-input bg-black/[0.03] text-ink-muted"
                  />
                  <p className="text-xs text-ink-faint mt-1">Sign-in email — change via password reset or support.</p>
                </div>
                <div>
                  <label htmlFor="account-display-name" className="block text-sm font-medium text-ink mb-1">
                    Display name
                  </label>
                  <input
                    id="account-display-name"
                    type="text"
                    name="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    className="tv-input"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="account-phone" className="block text-sm font-medium text-ink mb-1">
                    Phone <span className="font-normal text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="account-phone"
                    type="tel"
                    name="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    className="tv-input"
                    placeholder="+358 40 123 4567"
                  />
                </div>
                {profileMessage ? (
                  <NoticeCallout
                    title={profileMessage.kind === 'ok' ? 'Saved' : 'Could not save'}
                    tone={profileMessage.kind === 'ok' ? 'success' : 'danger'}
                  >
                    {profileMessage.text}
                  </NoticeCallout>
                ) : null}
                <button type="submit" disabled={profileSaving} className="tv-btn-primary">
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
