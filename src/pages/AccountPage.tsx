/**
 * Consumer hub: bookings, wishlist, cart, and future reviews — one place to manage trip planning.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Heart,
  ShoppingCart,
  Star,
  ChevronRight,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchMyBookings } from '../data/supabase-bookings';
import { fetchWishlistListingIds } from '../data/supabase-wishlist';
import { fetchCartCount } from '../data/supabase-cart';
import {
  fetchConsumerProfileRow,
  saveConsumerProfile,
  normalizeConsumerPhone,
} from '../data/supabase-consumer-profile';
interface AccountPageProps {
  onNavigate: (page: string) => void;
}

type HubStats = { bookings: number; wishlist: number; cart: number };

export default function AccountPage({ onNavigate }: AccountPageProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<HubStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
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
    try {
      const [bookings, wishlistIds, cart] = await Promise.all([
        fetchMyBookings(),
        fetchWishlistListingIds(user.id),
        fetchCartCount(user.id),
      ]);
      setStats({
        bookings: bookings.length,
        wishlist: wishlistIds.length,
        cart,
      });
    } catch {
      setStats({ bookings: 0, wishlist: 0, cart: 0 });
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (user) loadStats();
    else setStats(null);
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
      <div className="min-h-screen bg-paper pt-20">
        <div className="max-w-xl mx-auto px-4 py-12">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Account</h1>
          <p className="mt-2 text-ink-muted">
            Account features need the live app configuration. You can still browse tours or reach support.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2">
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
    return (
      <div className="min-h-screen bg-paper pt-20">
        <div className="max-w-xl mx-auto px-4 py-12">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Account</h1>
          <p className="mt-2 text-ink-muted">Log in to see trips you’ve booked and tours you’ve saved.</p>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/log-in?next=account');
              onNavigate('auth');
            }}
            className="tv-btn-primary mt-8"
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
    onClick: () => void;
    muted?: boolean;
  }[] = [
    {
      id: 'bookings',
      title: 'Trips',
      description: 'Tours you’ve booked',
      icon: Calendar,
      count: stats != null ? badge(stats.bookings) : undefined,
      onClick: () => onNavigate('bookings'),
    },
    {
      id: 'wishlist',
      title: 'Wishlist',
      description: 'Tours you saved',
      icon: Heart,
      count: stats != null ? badge(stats.wishlist) : undefined,
      onClick: () => onNavigate('wishlist'),
    },
    {
      id: 'cart',
      title: 'Cart',
      description: 'Saved items — book from the tour page',
      icon: ShoppingCart,
      count: stats != null ? badge(stats.cart) : undefined,
      onClick: () => onNavigate('cart'),
    },
    {
      id: 'reviews',
      title: 'Reviews',
      description: 'Leave feedback after your trips — coming soon',
      icon: Star,
      onClick: () => {},
      muted: true,
    },
  ];

  return (
    <div className="min-h-screen bg-paper pt-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 pb-16">
        <div className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">Account</h1>
          <p className="mt-2 text-ink-muted truncate" title={user.email ?? undefined}>
            {user.email}
          </p>
        </div>

        <section className="mb-12">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-4">Profile</h2>
          {profileLoading ? (
            <p className="text-sm text-ink-muted">Loading profile…</p>
          ) : (
            <form
              className="space-y-4 max-w-lg"
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
                    setProfileMessage({ kind: 'err', text: res.error ?? 'Could not save.' });
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
              {profileMessage && (
                <p
                  className={`text-sm ${profileMessage.kind === 'ok' ? 'text-emerald-800' : 'text-red-600'}`}
                  role={profileMessage.kind === 'err' ? 'alert' : undefined}
                >
                  {profileMessage.text}
                </p>
              )}
              <button type="submit" disabled={profileSaving} className="tv-btn-primary">
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          )}
        </section>

        <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Your travel</h2>
        <ul className="divide-y divide-black/[0.06]">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const interactive = !tile.muted;
            return (
              <li key={tile.id}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={tile.onClick}
                  className={`lux-flat w-full text-left py-4 flex items-center gap-4 ${
                    interactive ? '' : 'opacity-60 cursor-default'
                  }`}
                >
                  <Icon className="w-5 h-5 text-ink-muted shrink-0" strokeWidth={tile.id === 'wishlist' ? 2 : 1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{tile.title}</span>
                      {tile.count != null && (
                        <span className="text-sm tabular-nums text-ink-muted">{tile.count}</span>
                      )}
                    </span>
                    <span className="block text-sm text-ink-muted mt-0.5">{tile.description}</span>
                  </span>
                  {interactive && <ChevronRight className="w-5 h-5 text-ink-faint shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-10">
          <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-ghost -ml-2">
            Browse tours
          </button>
        </p>
      </div>
    </div>
  );
}
