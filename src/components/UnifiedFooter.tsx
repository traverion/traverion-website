import { useState } from 'react';
import { Mail, Clock, Globe, Search, Heart, ChevronDown } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';

interface UnifiedFooterProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function UnifiedFooter({ currentPage, onNavigate }: UnifiedFooterProps) {
  const { t, language, setLanguage } = useTranslation();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    setIsLanguageOpen(false);
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-[9999] bg-white shadow-2xl border-t border-gray-200">
      {/* Section 1: Contact Info & Language */}
      <div className="bg-gradient-to-r from-slate-800 via-gray-900 to-slate-800 text-white py-3 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Contact Info */}
          <div className="flex flex-col sm:flex-row items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-300" />
              <a href="mailto:info@traverion.com" className="hover:text-gray-200 transition-colors duration-300 font-medium">
                info@traverion.com
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-300" />
              <span className="text-gray-300">Mon-Fri: 08:00-17:30</span>
            </div>
          </div>

          {/* Language Selection */}
          <div className="relative">
            <button
              onClick={() => setIsLanguageOpen(!isLanguageOpen)}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors duration-300"
            >
              <Globe className="w-4 h-4" />
              <span className="font-medium">{language.toUpperCase()}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isLanguageOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isLanguageOpen && (
              <div className="absolute bottom-full right-0 mb-2 bg-slate-700 rounded-lg shadow-lg overflow-hidden">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition-colors duration-200 ${
                    language === 'en' ? 'bg-slate-600' : ''
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => handleLanguageChange('fi')}
                  className={`w-full px-4 py-2 text-left hover:bg-slate-600 transition-colors duration-200 ${
                    language === 'fi' ? 'bg-slate-600' : ''
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
      <div className="bg-white py-4 px-4 border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_SRC}
              alt=""
              className="h-10 w-10 sm:h-12 sm:w-12 object-contain flex-shrink-0"
            />
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">
                TRAVERION
              </h1>
              <p className="text-sm text-gray-600">Beyond Ordinary</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <button
              onClick={() => onNavigate('packages')}
              className={`text-gray-700 hover:text-sky-600 transition-colors duration-300 font-medium ${
                currentPage === 'packages' ? 'text-sky-600' : ''
              }`}
            >
              {t.navigation?.packages || 'Tours'}
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className={`text-gray-700 hover:text-sky-600 transition-colors duration-300 font-medium ${
                currentPage === 'contact' ? 'text-sky-600' : ''
              }`}
            >
              {t.navigation?.contact || 'Contact'}
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-600 hover:text-sky-600 transition-colors duration-300">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 text-gray-600 hover:text-sky-600 transition-colors duration-300 relative">
              <Heart className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                3
              </span>
            </button>
            <button
              onClick={() => onNavigate('contact')}
              className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:from-sky-600 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              BOOK A HOLIDAY
            </button>
          </div>
        </div>
      </div>

      {/* Section 3: Sale Banner */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-white text-amber-600 px-3 py-1 rounded-full font-bold text-lg">
              -40%
            </div>
            <div>
              <h3 className="font-bold text-lg">{t.promotions?.title || 'Last-minute deals up to -40%'}</h3>
              <p className="text-sm opacity-90">{t.promotions?.subtitle || 'Last-minute trips to the world\'s most beautiful destinations'}</p>
            </div>
          </div>
          <button className="bg-white text-amber-600 px-6 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-300 shadow-lg">
            {t.promotions?.cta || 'Explore Offers'}
          </button>
        </div>
      </div>
    </footer>
  );
}
