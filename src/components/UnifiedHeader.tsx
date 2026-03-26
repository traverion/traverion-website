import { useState, useRef, useEffect } from 'react';
import { Menu, X, User, LogOut, LayoutDashboard, ShoppingCart } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchCartCount } from '../data/supabase-cart';

interface UnifiedHeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function UnifiedHeader({ currentPage, onNavigate }: UnifiedHeaderProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !user?.id) {
      setCartCount(0);
      return;
    }
    fetchCartCount(user.id).then(setCartCount).catch(() => setCartCount(0));
  }, [user?.id, currentPage]);

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

  return (
    <header className="fixed top-0 left-0 right-0 z-[9999] bg-white/95 backdrop-blur-md shadow-md border-b border-gray-100/80 supports-[backdrop-filter]:bg-white/88 transition-shadow duration-500 ease-lux">
      {/* Logo & Navigation */}
      <div className="bg-white py-3 px-4 border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex flex-row justify-between items-center gap-4">
          {/* Logo + tagline (left on mobile and desktop) */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink">
            <img 
              src="/traveriontransparent.png" 
              alt="TRAVERION Logo" 
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain flex-shrink-0"
              onError={(e) => {
                // Fallback if image fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex-shrink-0 min-w-0">
              <h1 className="text-xl sm:text-2xl font-light text-finland">
                TRAVERION
              </h1>
              <p className="hidden sm:block text-xs sm:text-sm text-gray-600 font-light">Tours & Activities · Worldwide</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`lux-nav-link font-light uppercase ${
                currentPage === 'home' ? 'text-finland lux-nav-link--active' : 'text-gray-700 hover:text-finland'
              }`}
            >
              {t.navigation?.home || 'Home'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className={`lux-nav-link font-light uppercase ${
                currentPage === 'packages' ? 'text-finland lux-nav-link--active' : 'text-gray-700 hover:text-finland'
              }`}
            >
              {t.navigation?.tours || t.navigation?.packages || 'Tours'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('about')}
              className={`lux-nav-link font-light uppercase ${
                currentPage === 'about' ? 'text-finland lux-nav-link--active' : 'text-gray-700 hover:text-finland'
              }`}
            >
              About
            </button>
            <button
              type="button"
              onClick={() => onNavigate('blog')}
              className={`lux-nav-link font-light uppercase ${
                currentPage === 'blog' ? 'text-finland lux-nav-link--active' : 'text-gray-700 hover:text-finland'
              }`}
            >
              {t.navigation?.blog || 'Blog'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className={`lux-nav-link font-light uppercase ${
                currentPage === 'contact' ? 'text-finland lux-nav-link--active' : 'text-gray-700 hover:text-finland'
              }`}
            >
              {t.navigation?.contact || 'Contact'}
            </button>
          </nav>

          {/* Action area: Cart, Profile (icon + label) */}
          <div className="flex items-center gap-4 sm:gap-6" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => {
                if (isSupabaseConfigured() && !user) {
                  window.history.pushState({}, '', '/auth?tab=signup&next=cart');
                  onNavigate('auth');
                } else onNavigate('cart');
              }}
              className="lux-tap-target hidden lg:flex flex-col items-center gap-0.5 p-2 text-gray-600 hover:text-finland relative rounded-lg"
              aria-label="Cart"
              title="Cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-finland text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
              <span className="text-[10px] font-medium uppercase tracking-wide">Cart</span>
            </button>
            {/* Profile: dropdown with Log in / Sign up when not logged in; My bookings & Log out when logged in */}
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((o) => !o)}
                className="lux-tap-target flex flex-col items-center gap-0.5 p-2 text-gray-600 hover:text-finland rounded-lg"
                aria-label="Profile"
              >
                {user ? (
                  <span className="w-8 h-8 rounded-full bg-finland/20 text-finland flex items-center justify-center text-sm font-medium border border-gray-200">
                    {(user.email ?? user.id).slice(0, 1).toUpperCase()}
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </span>
                )}
                <span className="text-[10px] font-medium uppercase tracking-wide">Profile</span>
              </button>
              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-xl shadow-soft-lg border border-gray-100 animate-slide-down">
                  {!isSupabaseConfigured() ? (
                    <div className="px-3 py-2 space-y-2">
                      <p className="text-xs text-gray-600 leading-snug">
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
                        className="lux-flat w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                      >
                        Browse tours
                      </button>
                    </div>
                  ) : user ? (
                    <>
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setIsUserMenuOpen(false); onNavigate('account'); }}
                        className="lux-flat w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left rounded-lg"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        My account
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsUserMenuOpen(false); signOut(); }}
                        className="lux-flat w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left rounded-lg"
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
                        window.history.pushState({}, '', '/auth?tab=signup&next=home');
                        onNavigate('auth');
                      }}
                      className="lux-flat w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left rounded-lg"
                    >
                      <User className="w-4 h-4" />
                      Log in / Sign up
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="btn-luxury bg-finland text-white px-4 sm:px-6 py-2 rounded-lg font-medium hover:bg-finland-dark shadow-soft hover:shadow-soft-lg hidden lg:block text-sm sm:text-base"
            >
              FIND TOURS
            </button>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="no-lux-interaction lux-tap-target lg:hidden p-2 text-gray-600 hover:text-finland rounded-lg"
              aria-label="Menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white max-h-screen overflow-y-auto">
            <nav className="flex flex-col p-4 space-y-2">
              <button
                onClick={() => {
                  onNavigate('home');
                  setIsMobileMenuOpen(false);
                }}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'home' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.home || 'Home'}
              </button>
              <button
                onClick={() => {
                  onNavigate('packages');
                  setIsMobileMenuOpen(false);
                }}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'packages' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.tours || t.navigation?.packages || 'Tours'}
              </button>
              <button
                onClick={() => {
                  onNavigate('about');
                  setIsMobileMenuOpen(false);
                }}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'about' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                About
              </button>
              <button
                onClick={() => {
                  onNavigate('blog');
                  setIsMobileMenuOpen(false);
                }}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'blog' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.blog || 'Blog'}
              </button>
              <button
                onClick={() => {
                  onNavigate('contact');
                  setIsMobileMenuOpen(false);
                }}
                className={`lux-flat text-left px-4 py-3 rounded-lg transition-colors duration-300 ease-lux font-medium ${
                  currentPage === 'contact' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.contact || 'Contact'}
              </button>
              
              {/* Mobile: Cart (requires Supabase for synced cart) */}
              {isSupabaseConfigured() && (
                <button
                  onClick={() => {
                    if (!user) {
                      window.history.pushState({}, '', '/auth?tab=signup&next=cart');
                      onNavigate('auth');
                    } else onNavigate('cart');
                    setIsMobileMenuOpen(false);
                  }}
                  className="lux-flat w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Cart {cartCount > 0 && `(${cartCount})`}
                </button>
              )}
              {!isSupabaseConfigured() && (
                <div className="px-4 py-3 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-600">
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
              <div className="border-t border-gray-200 pt-4 space-y-2">
                {isSupabaseConfigured() && user ? (
                  <div className="px-2 py-2 flex items-center gap-2 text-sm text-gray-600">
                    <span className="w-8 h-8 rounded-full bg-finland/20 text-finland flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {(user.email ?? user.id).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{user.email}</span>
                  </div>
                ) : null}
                {isSupabaseConfigured() && !user && (
                  <button
                    onClick={() => {
                      window.history.pushState({}, '', '/auth?tab=signup&next=home');
                      onNavigate('auth');
                      setIsMobileMenuOpen(false);
                    }}
                    className="lux-flat w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 ease-lux flex items-center gap-2"
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
                      className="lux-flat w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 ease-lux flex items-center gap-2"
                    >
                      <LayoutDashboard className="w-5 h-5" />
                      My account
                    </button>
                    <button
                      onClick={() => {
                        signOut();
                        setIsMobileMenuOpen(false);
                      }}
                      className="lux-flat w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 ease-lux flex items-center gap-2"
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
                  className="btn-luxury w-full bg-finland text-white px-4 py-3 rounded-lg font-medium hover:bg-finland-dark transition-all duration-300 ease-lux shadow-lg text-center"
                >
                  FIND TOURS
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
