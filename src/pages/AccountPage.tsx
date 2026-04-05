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
  LayoutDashboard,
  UserRound,
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
      <div className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="max-w-lg mx-auto px-4 text-center">
          <LayoutDashboard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900">My account</h1>
          <p className="mt-2 text-gray-600">
            Account features need the live app configuration. You can still browse tours or reach support.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="px-5 py-2.5 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              Browse tours
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
            >
              Contact support
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
            <LayoutDashboard className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-900">My account</h1>
            <p className="mt-2 text-gray-600 mb-6">
              Sign in to see your bookings, saved tours, and cart in one place.
            </p>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/log-in?next=account');
                onNavigate('auth');
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-finland text-white font-medium hover:bg-finland-dark"
            >
              <LogIn className="w-5 h-5" />
              Sign in / Sign up
            </button>
          </div>
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
      title: 'Bookings',
      description: 'Status of your reservations',
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
      description: 'Request bookings from your cart',
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
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">My account</h1>
          <p className="text-sm text-gray-500 mt-1 truncate" title={user.email ?? undefined}>
            {user.email}
          </p>
          <p className="text-gray-600 mt-3 text-sm">
            Everything you need as a guest: trips you booked, ideas you saved, and cart requests.
          </p>
        </div>

        <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-finland/10 text-finland">
              <UserRound className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Profile & contact</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                How we reach you about bookings. Only you can edit this — it is stored on your account.
              </p>
            </div>
          </div>
          {profileLoading ? (
            <p className="text-sm text-gray-500">Loading profile…</p>
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
                <label htmlFor="account-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="account-email"
                  type="email"
                  value={user.email ?? ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Sign-in email — change via password reset or support.</p>
              </div>
              <div>
                <label htmlFor="account-display-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Display name
                </label>
                <input
                  id="account-display-name"
                  type="text"
                  name="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-finland focus:border-finland outline-none text-sm"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="account-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  id="account-phone"
                  type="tel"
                  name="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-finland focus:border-finland outline-none text-sm"
                  placeholder="+358 40 123 4567"
                />
              </div>
              {profileMessage && (
                <p
                  className={`text-sm ${profileMessage.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}
                  role={profileMessage.kind === 'err' ? 'alert' : undefined}
                >
                  {profileMessage.text}
                </p>
              )}
              <button
                type="submit"
                disabled={profileSaving}
                className="px-4 py-2.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50"
              >
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          )}
        </section>

        <ul className="grid gap-3 sm:grid-cols-2">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const interactive = !tile.muted;
            return (
              <li key={tile.id}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={tile.onClick}
                  className={`w-full text-left rounded-xl border p-4 flex items-start gap-4 transition-colors ${
                    interactive
                      ? 'bg-white border-gray-200 hover:border-finland/40 hover:bg-finland/[0.03] shadow-sm'
                      : 'bg-gray-50 border-gray-100 opacity-90 cursor-default'
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                      tile.muted ? 'bg-gray-200/80 text-gray-500' : 'bg-finland/10 text-finland'
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={tile.id === 'wishlist' ? 2 : 1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900">{tile.title}</span>
                      {tile.count != null && (
                        <span className="text-sm font-medium tabular-nums text-gray-500">{tile.count}</span>
                      )}
                    </span>
                    <span className="block text-sm text-gray-500 mt-0.5">{tile.description}</span>
                  </span>
                  {interactive && <ChevronRight className="w-5 h-5 text-gray-300 shrink-0 mt-1" />}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center">
          <button
            type="button"
            onClick={() => onNavigate('packages')}
            className="text-sm font-medium text-finland hover:underline"
          >
            Browse tours & activities
          </button>
        </p>
      </div>
    </div>
  );
}
