import { Menu, X, Search, User, Heart, ShoppingBag, Globe, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryInput from './ui/LuxuryInput';
import ContactInfoHeader from './ContactInfoHeader';
import { useTranslation } from '../contexts/TranslationContext';

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Header({ currentPage, onNavigate }: HeaderProps) {
  const { language, setLanguage, t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { name: t.nav.home, id: 'home' },
    { name: t.nav.tours, id: 'packages' },
    { name: t.nav.insights, id: 'blog' },
    { name: t.nav.contact, id: 'contact' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Contact Info Header */}
      <ContactInfoHeader />
      
      {/* Main Navigation */}
      <nav className={`w-full transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/95 backdrop-blur-lg shadow-xl border-b border-gray-100' 
          : 'bg-white/95 backdrop-blur-lg shadow-lg'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div
            className="flex items-center cursor-pointer group"
            onClick={() => onNavigate('home')}
          >
            <div className="relative flex items-center space-x-3">
              <img
                src="/traveriontransparent.png"
                alt="Traverion"
                className="h-16 w-auto transition-transform duration-300 group-hover:scale-105"
              />
              <div className="hidden sm:block">
                <h1 className="text-2xl font-heading font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                  TRAVERION
                </h1>
                <p className="text-xs text-gray-500 -mt-1">Beyond Ordinary</p>
              </div>
              <div className="absolute -inset-2 bg-sky-500/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`relative px-4 py-2 text-sm font-heading font-semibold uppercase tracking-wide transition-all duration-300 rounded-lg group ${
                  currentPage === item.id
                    ? 'text-sky-500 bg-sky-50'
                    : 'text-gray-700 hover:text-sky-500 hover:bg-sky-50'
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <span className="relative z-10">{item.name}</span>
                {currentPage === item.id && (
                  <div className="absolute inset-0 bg-sky-100 rounded-lg animate-scale-in" />
                )}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Search */}
            <div className="relative">
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 text-gray-600 hover:text-sky-500 transition-colors duration-300 hover:bg-sky-50 rounded-lg"
              >
                <Search size={20} />
              </button>
              
              {searchOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 animate-fade-in-up">
                  <LuxuryInput
                    type="search"
                    placeholder="Search destinations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onClear={() => setSearchTerm('')}
                    className="shadow-xl"
                  />
                </div>
              )}
            </div>

            {/* Wishlist */}
            <button className="p-2 text-gray-600 hover:text-red-500 transition-colors duration-300 hover:bg-red-50 rounded-lg relative">
              <Heart size={20} />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-bounce-in">
                3
              </span>
            </button>

            {/* Language */}
            <div className="relative">
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'fi')}
                className="appearance-none bg-transparent border-none text-gray-700 pr-8 py-2 focus:outline-none cursor-pointer hover:text-sky-500 transition-colors"
              >
                <option value="fi">FI</option>
                <option value="en">EN</option>
              </select>
              <Globe size={20} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            {/* Hidden Admin Access - Triple click to access */}
            <button
              onClick={() => {
                // Triple click detection for admin access
                let clickCount = 0;
                const timer = setTimeout(() => {
                  clickCount = 0;
                }, 500);
                
                clickCount++;
                if (clickCount === 3) {
                  clearTimeout(timer);
                  onNavigate('admin');
                }
              }}
              className="p-2 text-transparent hover:text-gray-400 transition-colors duration-300 hover:bg-gray-50 rounded-lg opacity-0 hover:opacity-100"
              title="Admin Access (Triple Click)"
            >
              <Shield size={20} />
            </button>

            {/* CTA Button */}
            <LuxuryButton
              variant="gradient"
              size="sm"
              onClick={() => onNavigate('packages')}
              className="animate-fade-in-right"
            >
              {t.common.bookNow}
            </LuxuryButton>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-gray-700 hover:text-sky-500 transition-colors duration-300"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-6 space-y-2 border-t border-gray-200 animate-slide-in-top">
            {/* Mobile Search */}
            <div className="px-4 mb-4">
              <LuxuryInput
                type="search"
                placeholder="Search destinations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm('')}
              />
            </div>

            {navItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left px-4 py-3 text-sm font-heading font-semibold uppercase tracking-wide transition-all duration-300 rounded-lg ${
                  currentPage === item.id
                    ? 'text-sky-500 bg-sky-50 border-l-4 border-sky-500'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {item.name}
              </button>
            ))}

            {/* Mobile Actions */}
            <div className="px-4 pt-4 space-y-3 border-t border-gray-200">
              <div className="flex items-center space-x-4">
                <button className="flex items-center space-x-2 text-gray-600 hover:text-red-500 transition-colors">
                  <Heart size={18} />
                  <span className="text-sm">Wishlist (3)</span>
                </button>
                <div className="flex items-center space-x-2">
                  <Globe size={18} className="text-gray-600" />
                  <select 
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'fi')}
                    className="bg-transparent border-none text-gray-600 text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="fi">Suomi</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              
              <LuxuryButton
                variant="gradient"
                size="md"
                className="w-full"
                onClick={() => {
                  onNavigate('packages');
                  setMobileMenuOpen(false);
                }}
              >
                {t.common.bookNow}
              </LuxuryButton>
            </div>
          </div>
        )}
        </div>
      </nav>
    </header>
  );
}
