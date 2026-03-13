import { useState, useRef, useEffect } from 'react';
import { Globe, Search, ChevronDown, Menu, X, User, LogOut } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import SearchModal from './SearchModal';

interface UnifiedHeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function UnifiedHeader({ currentPage, onNavigate }: UnifiedHeaderProps) {
  const { t, language, setLanguage } = useTranslation();
  const { user, requestAuth, signOut } = useAuth();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setIsUserMenuOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isUserMenuOpen]);

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    setIsLanguageOpen(false);
  };

  const handleSearch = (searchData: any) => {
    console.log('Search data:', searchData);
    // Handle search logic here - you can navigate to packages page with filters
    onNavigate('packages');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-[9999] bg-white shadow-2xl">
      {/* Section 1: Slim trust bar – one line, language only */}
      <div className="bg-finland text-white py-1.5 px-4 animate-[fade-in_0.3s_ease-out]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-1 text-xs">
          <p className="text-white/90 font-light tracking-wide hidden sm:block">
            {t.topBanner?.trustLine ?? 'Free cancellation on most tours · Best price guarantee'}
          </p>
          <div className="relative flex items-center justify-end w-full sm:w-auto">
            <button
              onClick={() => setIsLanguageOpen(!isLanguageOpen)}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-md text-white/95 transition-colors duration-200"
              aria-label="Select language"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{language.toUpperCase()}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isLanguageOpen ? 'rotate-180' : ''}`} />
            </button>
            {isLanguageOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-100 animate-[fade-in_0.15s_ease-out]">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors duration-150 text-xs text-gray-700 ${
                    language === 'en' ? 'bg-gray-50 font-medium' : ''
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageChange('fi')}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors duration-150 text-xs text-gray-700 ${
                    language === 'fi' ? 'bg-gray-50 font-medium' : ''
                  }`}
                >
                  Suomi
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Logo & Navigation */}
      <div className="bg-white py-3 px-4 border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3">
            <img 
              src="/traveriontransparent.png" 
              alt="TRAVERION Logo" 
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain flex-shrink-0"
              onError={(e) => {
                // Fallback if image fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex-shrink-0">
              <h1 className="text-xl sm:text-2xl font-light text-finland">
                TRAVERION
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 font-light">Tours & Activities · Worldwide</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <button
              onClick={() => onNavigate('home')}
              className={`text-gray-700 hover:text-finland transition-colors duration-300 font-light uppercase ${
                currentPage === 'home' ? 'text-finland' : ''
              }`}
            >
              {t.navigation?.home || 'Home'}
            </button>
            <button
              onClick={() => onNavigate('packages')}
              className={`text-gray-700 hover:text-finland transition-colors duration-300 font-light uppercase ${
                currentPage === 'packages' ? 'text-finland' : ''
              }`}
            >
              {t.navigation?.tours || t.navigation?.packages || 'Tours'}
            </button>
            <button
              onClick={() => onNavigate('blog')}
              className={`text-gray-700 hover:text-finland transition-colors duration-300 font-light uppercase ${
                currentPage === 'blog' ? 'text-finland' : ''
              }`}
            >
              {t.navigation?.blog || 'Blog'}
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className={`text-gray-700 hover:text-finland transition-colors duration-300 font-light uppercase ${
                currentPage === 'contact' ? 'text-finland' : ''
              }`}
            >
              {t.navigation?.contact || 'Contact'}
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-4" ref={userMenuRef}>
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-gray-600 hover:text-finland transition-colors duration-300 hidden lg:block"
            >
              <Search className="w-5 h-5" />
            </button>
            {isSupabaseConfigured() && (user ? (
              <div className="relative hidden lg:block">
                <button
                  onClick={() => setIsUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 hover:shadow-md transition-all duration-200"
                >
                  <span className="w-8 h-8 rounded-full bg-finland/20 text-finland flex items-center justify-center text-sm font-medium">
                    {(user.email ?? user.id).slice(0, 1).toUpperCase()}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 animate-[fade-in_0.15s_ease-out]">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setIsUserMenuOpen(false); signOut(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => requestAuth()}
                className="hidden lg:flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-finland border border-gray-200 rounded-lg hover:border-finland/50 transition-colors duration-200"
              >
                <User className="w-4 h-4" />
                Log in
              </button>
            ))}
            <button
              onClick={() => onNavigate('packages')}
              className="bg-finland text-white px-4 sm:px-6 py-2 rounded-lg font-light hover:bg-finland-dark transition-all duration-300 shadow-lg hover:shadow-xl hidden lg:block text-sm sm:text-base"
            >
              FIND TOURS
            </button>
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-gray-600 hover:text-finland transition-colors duration-300"
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
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-medium ${
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
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-medium ${
                  currentPage === 'packages' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.tours || t.navigation?.packages || 'Tours'}
              </button>
              <button
                onClick={() => {
                  onNavigate('blog');
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-medium ${
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
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-medium ${
                  currentPage === 'contact' ? 'bg-finland/10 text-finland' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.contact || 'Contact'}
              </button>
              
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
                <button
                  onClick={() => {
                    setIsSearchOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 flex items-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  Search Tours
                </button>
                {isSupabaseConfigured() && !user && (
                  <button
                    onClick={() => {
                      requestAuth();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 flex items-center gap-2"
                  >
                    <User className="w-5 h-5" />
                    Log in
                  </button>
                )}
                {isSupabaseConfigured() && user && (
                  <button
                    onClick={() => {
                      signOut();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 flex items-center gap-2"
                  >
                    <LogOut className="w-5 h-5" />
                    Log out
                  </button>
                )}
                <button
                  onClick={() => {
                    onNavigate('packages');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full bg-finland text-white px-4 py-3 rounded-lg font-medium hover:bg-finland-dark transition-all duration-300 shadow-lg text-center"
                >
                  FIND TOURS
                </button>
              </div>
            </nav>
          </div>
        )}
      </div>

      {/* Section 3: Promo Banner */}
      <div className="bg-finland-light text-white py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-white text-finland px-2 py-1 rounded-full font-bold text-xs sm:text-sm">
              Popular
            </div>
            <div className="text-center sm:text-left">
              <h3 className="font-bold text-xs sm:text-sm">{t.promotions?.title || 'Best-selling tours & activities'}</h3>
              <p className="text-xs opacity-90 hidden sm:block">{t.promotions?.subtitle || 'Top-rated experiences in Southeast Asia'}</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('packages')}
            className="bg-white text-finland px-3 sm:px-4 py-1 rounded text-xs sm:text-sm font-medium hover:bg-gray-100 transition-colors duration-300 whitespace-nowrap"
          >
            {t.promotions?.cta || 'Browse Tours'}
          </button>
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        onSearch={handleSearch} 
      />
    </header>
  );
}
