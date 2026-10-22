import { useState, useRef, useEffect } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  Menu,
  X,
  User,
  LogOut,
  LayoutDashboard,
  Calendar,
  Heart,
  LifeBuoy,
  ExternalLink,
  Search,
  ShoppingBag,
  Compass,
  Map,
  Home,
} from 'lucide-react';
import {
  prefetchAccountPage,
  prefetchAuthPage,
  prefetchMyBookingsPage,
  prefetchPackagesPage,
  prefetchStaysPage,
  prefetchWishlistPage,
} from '../lib/routePrefetch';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { travelerDisplayNameFromSources } from '../lib/traveler-display-name';
import TravelerTestModeBanner from './TravelerTestModeBanner';
import {
  clearBookingsUnread,
  getBookingNotificationEventName,
  hasBookingsUnread,
} from '../lib/customerBookingNotifications';

interface UnifiedHeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function UnifiedHeader({ currentPage, onNavigate }: UnifiedHeaderProps) {
  const { user, signOut, loading: authLoading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [hasUnreadBookings, setHasUnreadBookings] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuPanelRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useDialogFocus(isMobileMenuOpen, mobileMenuRef, () => setIsMobileMenuOpen(false));
  useDialogFocus(isUserMenuOpen, userMenuPanelRef, () => setIsUserMenuOpen(false));

  useEffect(() => {
    if (!isSupabaseConfigured() || !user?.id) {
      setHasUnreadBookings(false);
      return;
    }
    const refresh = () => setHasUnreadBookings(hasBookingsUnread(user.id));
    refresh();
    const eventName = getBookingNotificationEventName();
    window.addEventListener('storage', refresh);
    window.addEventListener(eventName, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(eventName, refresh);
    };
  }, [user?.id]);

  const openBookings = () => {
    if (user?.id) clearBookingsUnread(user.id);
    setHasUnreadBookings(false);
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    onNavigate('bookings');
  };

  const travelerDisplayName = (() => {
    if (!user) return '';
    const meta = user.user_metadata as {
      full_name?: string;
      display_name?: string;
      name?: string;
      customer_first_name?: string;
      customer_last_name?: string;
    } | undefined;
    return travelerDisplayNameFromSources({
      metadata: meta,
      fallback: '',
    });
  })();
  const travelerInitial = (
    travelerDisplayName ||
    user?.email ||
    user?.id ||
    'T'
  )
    .toString()
    .trim()
    .slice(0, 1)
    .toUpperCase() || 'T';

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isUserMenuOpen && !isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isUserMenuOpen, isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobileMenuOpen]);

  const [headerScrolled, setHeaderScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setHeaderScrolled(y > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
    <header
      data-scrolled={headerScrolled ? 'true' : undefined}
      className={`tv-consumer-header fixed top-0 left-0 right-0 z-[9999] border-b bg-white/95 backdrop-blur-md pt-[env(safe-area-inset-top,0px)] transition-[box-shadow,border-color] duration-200 ease-out ${
        headerScrolled ? 'border-black/[0.06]' : 'border-[#E8EBF0]'
      }`}
    >
      {/* 3-column grid keeps primary nav optically centered regardless of left/right widths */}
      <div className="tv-shell grid h-[4.75rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="lux-flat flex min-w-0 items-center gap-2.5 justify-self-start"
            aria-label="Traverion home"
          >
            <img
              src={BRAND_LOGO_SRC}
              alt="TRAVERION"
              className="h-9 w-9 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="font-sans text-[0.9375rem] font-bold tracking-tight text-[#111827]">Traverion</span>
          </button>

          <nav className="tv-header-nav hidden items-center gap-1 justify-self-center lg:flex" aria-label="Primary">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              aria-current={currentPage === 'home' ? 'page' : undefined}
              className={`tv-header-nav__item lux-flat ${
                currentPage === 'home' ? 'tv-header-nav__item--active' : ''
              }`}
            >
              <Compass className="h-[0.9375rem] w-[0.9375rem] shrink-0" strokeWidth={2.35} aria-hidden />
              Explore
            </button>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              onPointerEnter={prefetchPackagesPage}
              aria-current={
                currentPage === 'packages' || currentPage === 'tour-details' ? 'page' : undefined
              }
              className={`tv-header-nav__item lux-flat ${
                currentPage === 'packages' || currentPage === 'tour-details' ? 'tv-header-nav__item--active' : ''
              }`}
            >
              <Map className="h-[0.9375rem] w-[0.9375rem] shrink-0" strokeWidth={2.35} aria-hidden />
              Tours
            </button>
            <button
              type="button"
              onClick={() => onNavigate('stays')}
              onPointerEnter={prefetchStaysPage}
              aria-current={currentPage === 'stays' || currentPage === 'stay-details' ? 'page' : undefined}
              className={`tv-header-nav__item lux-flat ${
                currentPage === 'stays' || currentPage === 'stay-details' ? 'tv-header-nav__item--active' : ''
              }`}
            >
              <Home className="h-[0.9375rem] w-[0.9375rem] shrink-0" strokeWidth={2.35} aria-hidden />
              Stays
            </button>
          </nav>

          <div className="flex items-center justify-end gap-1 sm:gap-1.5 justify-self-end" ref={userMenuRef}>
            <button
              type="button"
              className="lux-flat inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
              aria-label="Search tours"
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsUserMenuOpen(false);
                onNavigate('packages');
              }}
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>
            {user ? (
              <>
                <button
                  type="button"
                  className="lux-flat hidden h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland lg:inline-flex"
                  aria-label="Saved"
                  aria-current={currentPage === 'wishlist' ? 'page' : undefined}
                  onPointerEnter={prefetchWishlistPage}
                  onClick={() => onNavigate('wishlist')}
                >
                  <Heart className={`h-4 w-4 ${currentPage === 'wishlist' ? 'fill-finland text-finland' : ''}`} aria-hidden />
                </button>
                <button
                  type="button"
                  className="lux-flat relative hidden h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland lg:inline-flex"
                  aria-label={hasUnreadBookings ? 'Trips, unread updates' : 'Trips'}
                  aria-current={currentPage === 'bookings' ? 'page' : undefined}
                  onPointerEnter={prefetchMyBookingsPage}
                  onClick={openBookings}
                >
                  <Calendar className="h-4 w-4" aria-hidden />
                  {hasUnreadBookings ? (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" aria-hidden />
                  ) : null}
                </button>
              </>
            ) : null}
            <TravelerTestModeBanner variant="chip" />
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((o) => !o)}
                className="lux-tap-target flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-ink transition-colors duration-150 hover:text-finland focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finland"
                aria-label={hasUnreadBookings ? 'Profile, unread trip updates' : 'Profile'}
                aria-expanded={isUserMenuOpen}
                aria-haspopup="true"
                aria-controls="profile-menu"
                onPointerEnter={() => {
                  prefetchAuthPage();
                  prefetchMyBookingsPage();
                  prefetchAccountPage();
                  prefetchWishlistPage();
                }}
              >
                {user ? (
                  <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-finland/15 text-sm font-semibold text-finland ring-1 ring-black/[0.06]">
                    {travelerInitial}
                    {hasUnreadBookings ? (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
                    ) : null}
                  </span>
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-black/[0.08]">
                    <User className="h-4 w-4" />
                  </span>
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Profile</span>
              </button>
              {isUserMenuOpen && (
                <div
                  id="profile-menu"
                  ref={userMenuPanelRef}
                  role="dialog"
                  aria-label="Profile"
                  className="absolute right-0 top-full mt-1.5 w-[17.5rem] origin-top-right overflow-hidden rounded-[var(--tv-radius-lg,1rem)] bg-white py-1.5 shadow-[var(--tv-elev-4)] ring-1 ring-black/[0.06] motion-safe:animate-slide-down"
                >
                  {!isSupabaseConfigured() ? (
                    <div className="px-3.5 py-3 space-y-2">
                      <p className="text-xs text-ink-muted leading-snug">
                        Online accounts are not available in this environment yet. You can still browse tours and contact us for help.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('contact');
                        }}
                        className="lux-flat lux-tap-target min-h-11 w-full text-left px-2.5 py-2 text-sm font-medium text-finland hover:bg-finland/5 rounded-xl"
                      >
                        Contact support
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('packages');
                        }}
                        className="lux-flat lux-tap-target min-h-11 w-full text-left px-2.5 py-2 text-sm text-ink hover:bg-black/[0.04] rounded-xl"
                      >
                        Browse tours
                      </button>
                    </div>
                  ) : authLoading ? (
                    <p className="px-3.5 py-3 text-sm text-ink-muted" aria-busy="true">
                      Checking session…
                    </p>
                  ) : user ? (
                    <>
                      <div className="flex items-center gap-3 px-3.5 py-3 border-b border-black/[0.06] min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-finland/15 text-sm font-semibold text-finland ring-1 ring-finland/20">
                          {travelerInitial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{travelerDisplayName || 'Traveler'}</p>
                          <p className="truncate text-xs text-ink-muted" title={user.email ?? undefined}>
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onNavigate('account');
                          }}
                          className="lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-black/[0.04] text-left"
                        >
                          <LayoutDashboard className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          My account
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onNavigate('cart');
                          }}
                          aria-current={currentPage === 'cart' ? 'page' : undefined}
                          className={`lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left ${
                            currentPage === 'cart' ? 'bg-finland/10 font-semibold text-finland' : 'text-ink hover:bg-black/[0.04]'
                          }`}
                        >
                          <ShoppingBag className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          Cart
                        </button>
                        <button
                          type="button"
                          onClick={openBookings}
                          aria-current={currentPage === 'bookings' ? 'page' : undefined}
                          aria-label={hasUnreadBookings ? 'Trips, unread updates' : 'Trips'}
                          className={`lux-flat lux-tap-target min-h-11 w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left ${
                            currentPage === 'bookings' ? 'bg-finland/10 font-semibold text-finland' : 'text-ink hover:bg-black/[0.04]'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2.5">
                            <Calendar className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                            Trips
                          </span>
                          {hasUnreadBookings ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onNavigate('wishlist');
                          }}
                          aria-current={currentPage === 'wishlist' ? 'page' : undefined}
                          className={`lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left ${
                            currentPage === 'wishlist' ? 'bg-finland/10 font-semibold text-finland' : 'text-ink hover:bg-black/[0.04]'
                          }`}
                        >
                          <Heart className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          Saved
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onNavigate('contact');
                          }}
                          className="lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-black/[0.04] text-left"
                        >
                          <LifeBuoy className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          Contact support
                        </button>
                      </div>
                      <div className="border-t border-black/[0.06] py-1">
                        <a
                          href={supplierPortalLandingHref()}
                          className="lux-flat lux-tap-target min-h-11 flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-black/[0.04]"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <ExternalLink className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          Partner portal
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            void signOut();
                          }}
                          className="lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-black/[0.04] text-left"
                        >
                          <LogOut className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          Log out
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          window.history.pushState({}, '', '/log-in?next=home');
                          onNavigate('auth');
                        }}
                        className="lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-ink hover:bg-black/[0.04] text-left"
                      >
                        <User className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        Log in / Sign up
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('contact');
                        }}
                        className="lux-flat lux-tap-target min-h-11 w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-black/[0.04] text-left"
                      >
                        <LifeBuoy className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        Contact support
                      </button>
                      <a
                        href={supplierPortalLandingHref()}
                        className="lux-flat lux-tap-target min-h-11 flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-black/[0.04]"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <ExternalLink className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        Partner portal
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              onPointerEnter={() => {
                prefetchPackagesPage();
                prefetchAuthPage();
                prefetchMyBookingsPage();
              }}
              className="no-lux-interaction lux-tap-target lg:hidden inline-flex h-11 w-11 items-center justify-center text-ink-muted hover:text-finland rounded-lg"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="site-mobile-menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
    </header>

        {/* Mobile Menu — sibling of header so backdrop-filter does not trap position:fixed */}
        {isMobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            id="site-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="lg:hidden fixed inset-x-0 bottom-0 top-[calc(4.75rem+env(safe-area-inset-top,0px))] z-[9998] border-t border-black/[0.06] bg-paper overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom,0px))] motion-safe:animate-fade-in-down"
          >
            <nav className="flex flex-col space-y-1.5 p-4" aria-label="Mobile">
              <button
                type="button"
                onClick={() => {
                  onNavigate('home');
                  setIsMobileMenuOpen(false);
                }}
                aria-current={currentPage === 'home' ? 'page' : undefined}
                className={`tv-header-nav__item lux-flat w-full justify-start px-4 py-3 ${
                  currentPage === 'home' ? 'tv-header-nav__item--active' : ''
                }`}
              >
                <Compass className="h-[0.9375rem] w-[0.9375rem] shrink-0" strokeWidth={2.35} aria-hidden />
                Explore
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('packages');
                  setIsMobileMenuOpen(false);
                }}
                onPointerEnter={prefetchPackagesPage}
                aria-current={
                  currentPage === 'packages' || currentPage === 'tour-details' ? 'page' : undefined
                }
                className={`tv-header-nav__item lux-flat w-full justify-start px-4 py-3 ${
                  currentPage === 'packages' || currentPage === 'tour-details' ? 'tv-header-nav__item--active' : ''
                }`}
              >
                <Map className="h-[0.9375rem] w-[0.9375rem] shrink-0" strokeWidth={2.35} aria-hidden />
                Tours
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('stays');
                  setIsMobileMenuOpen(false);
                }}
                aria-current={currentPage === 'stays' || currentPage === 'stay-details' ? 'page' : undefined}
                className={`tv-header-nav__item lux-flat w-full justify-start px-4 py-3 ${
                  currentPage === 'stays' || currentPage === 'stay-details' ? 'tv-header-nav__item--active' : ''
                }`}
              >
                <Home className="h-[0.9375rem] w-[0.9375rem] shrink-0" strokeWidth={2.35} aria-hidden />
                Stays
              </button>
              {!isSupabaseConfigured() && (
                <div className="mx-2 px-4 py-3 rounded-xl bg-finland/[0.06] ring-1 ring-finland/15 text-sm text-ink-muted">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">Accounts</p>
                  <p className="mb-2">Accounts need the live site configuration.</p>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('contact');
                      setIsMobileMenuOpen(false);
                    }}
                    className="text-finland font-medium hover:underline"
                  >
                    Contact support
                  </button>
                </div>
              )}
              {/* Mobile Action Buttons */}
              <div className="border-t border-black/[0.06] pt-4 space-y-2">
                {isSupabaseConfigured() && authLoading ? (
                  <p className="px-4 py-3 text-sm text-ink-muted" aria-busy="true">
                    Checking session…
                  </p>
                ) : null}
                {isSupabaseConfigured() && !authLoading && user ? (
                  <div className="px-2 py-2 flex items-center gap-2 text-sm text-ink-muted min-w-0">
                    <span className="w-8 h-8 rounded-full bg-finland/20 text-finland flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {(user.email ?? user.id).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={user.email ?? undefined}>
                      {user.email}
                    </span>
                  </div>
                ) : null}
                {isSupabaseConfigured() && !authLoading && !user && (
                  <button
                    type="button"
                    onClick={() => {
                      window.history.pushState({}, '', '/log-in?next=home');
                      onNavigate('auth');
                      setIsMobileMenuOpen(false);
                    }}
                    className="lux-flat w-full text-left px-4 py-3 rounded-lg text-ink hover:bg-black/[0.04] transition-colors duration-300 ease-lux flex items-center gap-2"
                  >
                    <User className="w-5 h-5" />
                    Log in / Sign up
                  </button>
                )}
                {isSupabaseConfigured() && !authLoading && user && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('account');
                        setIsMobileMenuOpen(false);
                      }}
                      className="lux-flat w-full text-left px-4 py-3 rounded-lg text-ink hover:bg-black/[0.04] transition-colors duration-300 ease-lux flex items-center gap-2"
                    >
                      <LayoutDashboard className="w-5 h-5" />
                      My account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('cart');
                        setIsMobileMenuOpen(false);
                      }}
                      aria-current={currentPage === 'cart' ? 'page' : undefined}
                      className={`lux-flat w-full text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux flex items-center gap-2 ${
                        currentPage === 'cart' ? 'bg-finland/10 font-semibold text-finland' : 'text-ink hover:bg-black/[0.04]'
                      }`}
                    >
                      <ShoppingBag className="w-5 h-5" />
                      Cart
                    </button>
                    <button
                      type="button"
                      onClick={openBookings}
                      aria-current={currentPage === 'bookings' ? 'page' : undefined}
                      aria-label={hasUnreadBookings ? 'Trips, unread updates' : 'Trips'}
                      className={`lux-flat w-full text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux flex items-center justify-between gap-2 ${
                        currentPage === 'bookings' ? 'bg-finland/10 font-semibold text-finland' : 'text-ink hover:bg-black/[0.04]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Trips
                      </span>
                      {hasUnreadBookings ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('wishlist');
                        setIsMobileMenuOpen(false);
                      }}
                      aria-current={currentPage === 'wishlist' ? 'page' : undefined}
                      className={`lux-flat w-full text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux flex items-center gap-2 ${
                        currentPage === 'wishlist' ? 'bg-finland/10 font-semibold text-finland' : 'text-ink hover:bg-black/[0.04]'
                      }`}
                    >
                      <Heart className="w-5 h-5" />
                      Saved
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setIsMobileMenuOpen(false);
                      }}
                      className="lux-flat w-full text-left px-4 py-3 rounded-lg text-ink hover:bg-black/[0.04] transition-colors duration-300 ease-lux flex items-center gap-2"
                    >
                      <LogOut className="w-5 h-5" />
                      Log out
                    </button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
    </>
  );
}
