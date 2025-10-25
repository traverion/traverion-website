import { useState } from 'react';
import { Mail, Phone, Clock, Globe, Search, ChevronDown, Menu, X } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import SearchModal from './SearchModal';

interface UnifiedHeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function UnifiedHeader({ currentPage, onNavigate }: UnifiedHeaderProps) {
  const { t, language, setLanguage } = useTranslation();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
      {/* Section 1: Contact Info Banner */}
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-xs">
          {/* Contact Info */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-1">
              <Mail className="w-3 h-3 text-white/80" />
              <a href="mailto:info.traverion@gmail.com" className="hover:text-white transition-colors duration-300">
                info.traverion@gmail.com
              </a>
            </div>
            <div className="flex items-center gap-1">
              <Phone className="w-3 h-3 text-white/80" />
              <a href="tel:+3584578345138" className="hover:text-white transition-colors duration-300">
                +358 45 7834 5138
              </a>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-white/80" />
              <span className="text-white/80">Mon-Fri: 08:00-17:30</span>
            </div>
          </div>

          {/* Language Selection */}
          <div className="relative">
            <button
              onClick={() => setIsLanguageOpen(!isLanguageOpen)}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs transition-colors duration-300"
            >
              <Globe className="w-3 h-3" />
              <span>{language.toUpperCase()}</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isLanguageOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isLanguageOpen && (
              <div className="absolute bottom-full right-0 mb-1 bg-white rounded shadow-lg overflow-hidden">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`w-full px-2 py-1 text-left hover:bg-gray-100 transition-colors duration-200 text-xs text-gray-700 ${
                    language === 'en' ? 'bg-gray-100' : ''
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageChange('fi')}
                  className={`w-full px-2 py-1 text-left hover:bg-gray-100 transition-colors duration-200 text-xs text-gray-700 ${
                    language === 'fi' ? 'bg-gray-100' : ''
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
          <div className="flex items-center gap-3">
            <img 
              src="/traveriontransparent.png" 
              alt="TRAVERION Logo" 
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-2xl font-light bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">
                TRAVERION
              </h1>
              <p className="text-sm text-gray-600 font-light">Beyond Ordinary</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <button
              onClick={() => onNavigate('home')}
              className={`text-gray-700 hover:text-sky-600 transition-colors duration-300 font-light uppercase ${
                currentPage === 'home' ? 'text-sky-600' : ''
              }`}
            >
              {t.navigation?.home || 'Home'}
            </button>
            <button
              onClick={() => onNavigate('packages')}
              className={`text-gray-700 hover:text-sky-600 transition-colors duration-300 font-light uppercase ${
                currentPage === 'packages' ? 'text-sky-600' : ''
              }`}
            >
              {t.navigation?.packages || 'Packages'}
            </button>
            <button
              onClick={() => onNavigate('blog')}
              className={`text-gray-700 hover:text-sky-600 transition-colors duration-300 font-light uppercase ${
                currentPage === 'blog' ? 'text-sky-600' : ''
              }`}
            >
              {t.navigation?.blog || 'Blog'}
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className={`text-gray-700 hover:text-sky-600 transition-colors duration-300 font-light uppercase ${
                currentPage === 'contact' ? 'text-sky-600' : ''
              }`}
            >
              {t.navigation?.contact || 'Contact'}
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-gray-600 hover:text-sky-600 transition-colors duration-300 hidden lg:block"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-6 py-2 rounded-lg font-light hover:from-sky-600 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl hidden lg:block"
            >
              BOOK A HOLIDAY
            </button>
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-gray-600 hover:text-sky-600 transition-colors duration-300"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white">
            <nav className="flex flex-col p-4 space-y-3">
              <button
                onClick={() => {
                  onNavigate('home');
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-light uppercase ${
                  currentPage === 'home' ? 'bg-sky-50 text-sky-600' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.home || 'Home'}
              </button>
              <button
                onClick={() => {
                  onNavigate('packages');
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-light uppercase ${
                  currentPage === 'packages' ? 'bg-sky-50 text-sky-600' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.packages || 'Packages'}
              </button>
              <button
                onClick={() => {
                  onNavigate('blog');
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-light uppercase ${
                  currentPage === 'blog' ? 'bg-sky-50 text-sky-600' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.blog || 'Blog'}
              </button>
              <button
                onClick={() => {
                  onNavigate('contact');
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left px-4 py-3 rounded-lg transition-colors duration-300 font-light uppercase ${
                  currentPage === 'contact' ? 'bg-sky-50 text-sky-600' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.navigation?.contact || 'Contact'}
              </button>
              <button
                onClick={() => {
                  setIsSearchOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="text-left px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300 flex items-center gap-2"
              >
                <Search className="w-5 h-5" />
                Search
              </button>
              <button
                onClick={() => {
                  onNavigate('contact');
                  setIsMobileMenuOpen(false);
                }}
                className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-3 rounded-lg font-light hover:from-sky-600 hover:to-blue-700 transition-all duration-300 shadow-lg text-center"
              >
                BOOK A HOLIDAY
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Section 3: Sale Banner */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            <div className="bg-white text-amber-600 px-2 py-1 rounded-full font-bold text-sm">
              -40%
            </div>
            <div>
              <h3 className="font-bold text-sm">{t.promotions?.title || 'Last-minute deals up to -40%'}</h3>
              <p className="text-xs opacity-90">{t.promotions?.subtitle || 'Last-minute trips to the world\'s most beautiful destinations'}</p>
            </div>
          </div>
          <button className="bg-white text-amber-600 px-4 py-1 rounded text-sm font-medium hover:bg-gray-50 transition-colors duration-300">
            {t.promotions?.cta || 'Explore Offers'}
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
