/**
 * Consumer hub: profile, trips, and saved tours.
 */
import { useState, useEffect, useCallback } from 'react';
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
import NoticeCallout from '../components/NoticeCallout';
interface AccountPageProps {
  onNavigate: (page: string) => void;
}

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
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadStats = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id || !user.email) {
      setStats(null);
      return;
    }
    setStatsLoading(true);
    setStatsError(null);
    try {
      const [bookings, wishlistIds] = await Promise.all([
        fetchMyBookings(),
        fetchWishlistListingIds(user.id),
      ]);
      setStats({
        bookings: bookings.length,
        wishlist: wishlistIds.length,
      });
    } catch (e) {
      setStats(null);
      setStatsError(userFacingError(e, USER_ERROR.trips));
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (user) loadStats();
    else {
      setStats(null);
      setStatsError(null);
    }
  }, [user, loadStats]);

  const loadProfile = useCallback(async () => {
    if (!isSupabaseConfigured() || !user?.id) return;
    setProfileLoading(true);
    setProfileMessage(null);
    try {
      const row = await fetchConsumerProfileRow(user.id);
      const meta = user.user_metadata as { customer_phone?: string; phone?: string } | undefined;
      const fallbackPhone = meta?.customer_phone ?? meta?.phone ?? '';
      setDisplayName((row?.display_name ?? user.email?.split('@')[0] ?? '').trim());
      setPhone(row?.contact_phone?.trim() || fallbackPhone || '');
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id, user?.email, user?.user_metadata]);

  useEffect(() => {
    if (user) void loadProfile();
    else {
      setDisplayName('');
      setPhone('');
      setProfileMessage(null);
    }
  }, [user, loadProfile]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-paper tv-page">
        <div className="max-w-xl mx-auto px-4 py-12">
          <header className="mb-6 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
            <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
              Traveler
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Account</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Account features need the live app configuration. You can still browse tours or reach support.
            </p>
          </header>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
              Browse tours
            </button>
            <button type="button" onClick={() => onNavigate('contact')} className="tv-btn-ghost">
              Contact support
            </button>
          </div>
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
        <div className="max-w-xl mx-auto px-4 py-12">
          <header className="mb-6 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
            <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
              Traveler
            </div>
            <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Account</h1>
            <p className="mt-2 text-sm text-ink-muted">Log in to see trips you’ve booked and tours you’ve saved.</p>
          </header>
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
      title: 'Wishlist',
      description: 'Tours and stays you saved',
      icon: Heart,
      count: stats != null ? badge(stats.wishlist) : undefined,
      onClick: () => onNavigate('wishlist'),
    },
  ];

  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 pb-16">
        <div className="mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland mb-2">Traveler</p>
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Account</h1>
          <p className="mt-2 text-sm text-ink-muted truncate" title={user.email ?? undefined}>
            {displayName.trim() || user.email}
          </p>
          {displayName.trim() && user.email ? (
            <p className="mt-0.5 text-xs text-ink-faint truncate">{user.email}</p>
          ) : null}
        </div>

        <section className="mb-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-4">Profile</h2>
          {profileLoading ? (
            <div
              className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]"
              aria-busy="true"
              aria-label="Loading profile"
            >
              <SkeletonFormFields count={3} />
            </div>
          ) : (
            <form
              className="space-y-4 max-w-lg rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!user?.id) return;
                setProfileSaving(true);
                setProfileMessage(null);
                void (async () => {
                  const digits = normalizeConsumerPhone(phone).replace(/\D/g, '');
                  if (digits.length < 9) {
                    setProfileMessage({ kind: 'err', text: 'Enter a valid phone number (at least 9 digits).' });
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
                  Phone
                </label>
                <input
                  id="account-phone"
                  type="tel"
                  name="tel"
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

        <section className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15">
            Your travel
          </div>
          {statsError ? (
            <ErrorState
              className="mb-4 py-4"
              title="Could not load your trips"
              body={statsError}
              retry={{ onClick: () => void loadStats() }}
            />
          ) : null}
          <ul className="space-y-3">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <li key={tile.id}>
                  <button
                    type="button"
                    onClick={tile.onClick}
                    className={`lux-flat group flex w-full min-h-[3.75rem] items-center gap-4 rounded-2xl bg-paper-raised px-4 py-4 text-left shadow-soft ring-1 ring-black/[0.06] transition-[box-shadow,ring-color] hover:ring-finland/25 hover:shadow-soft-lg ${
                      tile.id === 'wishlist'
                        ? 'border-l-[3px] border-l-rose-400'
                        : 'border-l-[3px] border-l-finland'
                    }`}
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
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-sm tabular-nums font-semibold ${
                              tile.id === 'wishlist'
                                ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200/70'
                                : 'bg-finland/10 text-finland ring-1 ring-finland/20'
                            }`}
                          >
                            {tile.count}
                          </span>
                        ) : statsLoading ? (
                          <span className="h-5 w-8 animate-pulse rounded-full bg-black/[0.06]" aria-hidden />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">{tile.description}</span>
                    </span>
                    <ChevronRight className="w-5 h-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-finland" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl bg-amber-50/60 p-5 sm:p-6 ring-1 ring-amber-200/50">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900 ring-1 ring-amber-200/70">
            Security
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
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

        <p className="mt-8">
          <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost -ml-2">
            Browse tours
          </button>
        </p>
      </div>
    </div>
  );
}
