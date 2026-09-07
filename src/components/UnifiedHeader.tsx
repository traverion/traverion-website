import { useState, useRef, useEffect } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Menu, X, User, LogOut, LayoutDashboard, Calendar } from 'lucide-react';
import { prefetchAuthPage, prefetchMyBookingsPage, prefetchPackagesPage } from '../lib/routePrefetch';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
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
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [hasUnreadBookings, setHasUnreadBookings] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useDialogFocus(isMobileMenuOpen, mobileMenuRef, () => setIsMobileMenuOpen(false));

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

  return (
    <>
    <header className="fixed top-0 left-0 right-0 z-[9999] bg-paper/90 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button type="button" onClick={() => onNavigate('home')} className="lux-flat flex items-center gap-2 min-w-0" aria-label="Traverion home">
            <img 
              src={BRAND_LOGO_SRC} 
              alt="TRAVERION" 
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="font-sans text-[11px] font-semibold tracking-[0.18em] text-ink">TRAVERION</span>
          </button>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-6 flex-1 justify-center" aria-label="Primary">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              aria-current={currentPage === 'home' ? 'page' : undefined}
              className={`lux-flat text-sm font-medium ${
                currentPage === 'home' ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              Explore
            </button>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              onPointerEnter={prefetchPackagesPage}
              aria-current={
                currentPage === 'packages' || currentPage === 'tour-details' || currentPage === 'destination'
                  ? 'page'
                  : undefined
              }
              className={`lux-flat text-sm font-medium ${
                currentPage === 'packages' || currentPage === 'tour-details' || currentPage === 'destination'
                  ? 'text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Tours
            </button>
          </nav>

          {/* Action area: Cart, Profile (icon + label) */}
          <div className="flex items-center gap-4 sm:gap-6" ref={userMenuRef}>
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((o) => !o)}
                className="lux-tap-target flex flex-col items-center gap-0.5 p-1.5 text-ink-muted hover:text-finland rounded-lg"
                aria-label="Profile"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                aria-controls="profile-menu"
                onPointerEnter={() => {
                  prefetchAuthPage();
                  prefetchMyBookingsPage();
                }}
              >
                {user ? (
                  <span className="relative w-8 h-8 rounded-full bg-finland/20 text-finland flex items-center justify-center text-sm font-medium ring-1 ring-black/[0.08]">
                    {(user.email ?? user.id).slice(0, 1).toUpperCase()}
                    {hasUnreadBookings ? (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                    ) : null}
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full ring-1 ring-black/[0.08] flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </span>
                )}
                <span className="text-[10px] font-medium uppercase tracking-wide">Profile</span>
              </button>
              {isUserMenuOpen && (
                <div
                  id="profile-menu"
                  role="menu"
                  aria-label="Profile"
                  className="absolute right-0 top-full mt-1 py-1 w-48 origin-top-right bg-paper-raised rounded-xl shadow-soft-lg ring-1 ring-black/[0.08] motion-safe:animate-slide-down"
                >
                  {!isSupabaseConfigured() ? (
                    <div className="px-3 py-2 space-y-2">
                      <p className="text-xs text-ink-muted leading-snug">
                        Online accounts are not available in this environment yet. You can still browse tours and contact us for help.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('contact');
                        }}
                        className="lux-flat w-full text-left px-2 py-1.5 text-sm font-medium text-finland hover:bg-finland/5 rounded-lg"
                      >
                        Contact support
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onNavigate('packages');
                        }}
                        className="lux-flat w-full text-left px-2 py-1.5 text-sm text-ink hover:bg-black/[0.04] rounded-lg"
                      >
                        Browse tours
                      </button>
                    </div>
                  ) : user ? (
                    <>
                      <div className="px-3 py-2 border-b border-black/[0.06]">
                        <p className="text-sm font-medium text-ink truncate">{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setIsUserMenuOpen(false); onNavigate('account'); }}
                        className="lux-flat w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-black/[0.04] text-left rounded-lg"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        My account
                      </button>
                      <button
                        type="button"
                        onClick={openBookings}
                        className="lux-flat w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-ink hover:bg-black/[0.04] text-left rounded-lg"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Trips
                        </span>
                        {hasUnreadBookings ? <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsUserMenuOpen(false); signOut(); }}
                        className="lux-flat w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-black/[0.04] text-left rounded-lg"
                      >
                        <LogOut className="w-4 h-4" />
                        Log out
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        window.history.pushState({}, '', '/log-in?next=home');
                        onNavigate('auth');
                      }}
                      className="lux-flat w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-black/[0.04] text-left rounded-lg"
                    >
                      <User className="w-4 h-4" />
                      Log in / Sign up
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={() => onNavigate('packages')}
                onPointerEnter={prefetchPackagesPage}
                className="tv-btn-primary h-10 px-5 text-sm"
              >
                Find tours
              </button>
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
            className="lg:hidden fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-[9998] border-t border-black/[0.06] bg-paper overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom,0px))] motion-safe:animate-fade-in-down"
          >
            <nav className="flex flex-col p-4 space-y-2" aria-label="Mobile">
              <button
                onClick={() => {
                  onNavigate('home');
                  setIsMobileMenuOpen(false);
                }}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'home' ? 'bg-finland/10 text-finland' : 'text-ink hover:bg-black/[0.04]'
                }`}
              >
                Explore
              </button>
              <button
                onClick={() => {
                  onNavigate('packages');
                  setIsMobileMenuOpen(false);
                }}
                onPointerEnter={prefetchPackagesPage}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'packages' || currentPage === 'tour-details'
                    ? 'bg-finland/10 text-finland'
                    : 'text-ink hover:bg-black/[0.04]'
                }`}
              >
                Tours
              </button>
              {!isSupabaseConfigured() && (
                <div className="px-4 py-3 rounded-lg bg-black/[0.03] ring-1 ring-black/[0.06] text-sm text-ink-muted">
                  <p className="mb-2">Accounts and saved cart need the live site configuration.</p>
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
                {isSupabaseConfigured() && user ? (
                  <div className="px-2 py-2 flex items-center gap-2 text-sm text-ink-muted">
                    <span className="w-8 h-8 rounded-full bg-finland/20 text-finland flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {(user.email ?? user.id).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{user.email}</span>
                  </div>
                ) : null}
                {isSupabaseConfigured() && !user && (
                  <button
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
                {isSupabaseConfigured() && user && (
                  <>
                    <button
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
                      onClick={openBookings}
                      className="lux-flat w-full text-left px-4 py-3 rounded-lg text-ink hover:bg-black/[0.04] transition-colors duration-300 ease-lux flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Trips
                      </span>
                      {hasUnreadBookings ? <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> : null}
                    </button>
                    <button
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
                <button
                  onClick={() => {
                    onNavigate('packages');
                    setIsMobileMenuOpen(false);
                  }}
                  className="tv-btn-primary w-full justify-center"
                >
                  Find tours
                </button>
              </div>
            </nav>
          </div>
        )}
    </>
  );
}
