import { Menu, X, Search, User, Heart, ShoppingBag, Shield, ChevronDown, Plane, MapPin, Star, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import LuxuryButton from './ui/LuxuryButton';
import ContactInfoHeader from './ContactInfoHeader';
import { useTranslation } from '../contexts/TranslationContext';

interface TUIStyleHeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function TUIStyleHeader({ currentPage, onNavigate }: TUIStyleHeaderProps) {
  const { language, setLanguage, t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { 
      name: 'Lomamatkat', 
      id: 'packages',
      hasDropdown: true,
      dropdownItems: [
        { name: 'Vietnam', id: 'vietnam-9-day', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Thailand', id: 'thailand-10-day', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Cambodia', id: 'cambodia-10-day', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Laos', id: 'laos-8-day', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Myanmar', id: 'myanmar-7-day', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Kaikki Matkat', id: 'packages', icon: <Star className="w-4 h-4" /> }
      ]
    },
    { 
      name: 'Lennot', 
      id: 'flights',
      hasDropdown: true,
      dropdownItems: [
        { name: 'Kotimaan Lennot', id: 'domestic-flights', icon: <Plane className="w-4 h-4" /> },
        { name: 'Euroopan Lennot', id: 'europe-flights', icon: <Plane className="w-4 h-4" /> },
        { name: 'Aasian Lennot', id: 'asia-flights', icon: <Plane className="w-4 h-4" /> },
        { name: 'Amerikan Lennot', id: 'america-flights', icon: <Plane className="w-4 h-4" /> }
      ]
    },
    { 
      name: 'Hotellit', 
      id: 'hotels',
      hasDropdown: true,
      dropdownItems: [
        { name: 'Luxury Hotellit', id: 'luxury-hotels', icon: <Star className="w-4 h-4" /> },
        { name: 'Boutique Hotellit', id: 'boutique-hotels', icon: <Star className="w-4 h-4" /> },
        { name: 'Resortit', id: 'resorts', icon: <Star className="w-4 h-4" /> },
        { name: 'Kaikki Hotellit', id: 'all-hotels', icon: <Star className="w-4 h-4" /> }
      ]
    },
    { 
      name: 'Tarjoukset', 
      id: 'offers',
      hasDropdown: true,
      dropdownItems: [
        { name: 'Äkkilähdöt', id: 'last-minute', icon: <Calendar className="w-4 h-4" /> },
        { name: 'Varhaisvaraus', id: 'early-booking', icon: <Calendar className="w-4 h-4" /> },
        { name: 'Perhematkat', id: 'family-trips', icon: <Star className="w-4 h-4" /> },
        { name: 'Luksusmatkat', id: 'luxury-trips', icon: <Star className="w-4 h-4" /> }
      ]
    },
    { 
      name: 'Kohteet', 
      id: 'destinations',
      hasDropdown: true,
      dropdownItems: [
        { name: 'Aasia', id: 'asia', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Eurooppa', id: 'europe', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Amerikka', id: 'america', icon: <MapPin className="w-4 h-4" /> },
        { name: 'Afrikka', id: 'africa', icon: <MapPin className="w-4 h-4" /> }
      ]
    }
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
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div
              className="flex items-center cursor-pointer group"
              onClick={() => onNavigate('home')}
            >
              <div className="relative flex items-center space-x-3">
                <img
                  src="/traveriontransparent.png"
                  alt="Traverion"
                  className="h-12 w-auto transition-transform duration-300 group-hover:scale-105"
                />
                <div className="hidden sm:block">
                  <h1 className="text-xl font-heading font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                    TRAVERION
                  </h1>
                  <p className="text-xs text-gray-500 -mt-1">Beyond Ordinary</p>
                </div>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => (
                <div
                  key={item.id}
                  className="relative"
                  onMouseEnter={() => setActiveDropdown(item.id)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <button
                    onClick={() => onNavigate(item.id)}
                    className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium transition-all duration-300 rounded-lg ${
                      currentPage === item.id
                        ? 'text-sky-600 bg-sky-50'
                        : 'text-gray-700 hover:text-sky-600 hover:bg-sky-50'
                    }`}
                  >
                    <span>{item.name}</span>
                    {item.hasDropdown && (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {/* Dropdown Menu */}
                  {item.hasDropdown && activeDropdown === item.id && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                      {item.dropdownItems?.map((dropdownItem) => (
                        <button
                          key={dropdownItem.id}
                          onClick={() => {
                            onNavigate(dropdownItem.id);
                            setActiveDropdown(null);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-sky-50 transition-colors"
                        >
                          {dropdownItem.icon}
                          <span className="text-sm font-medium text-gray-700">
                            {dropdownItem.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              {/* Search */}
              <button className="p-2 text-gray-600 hover:text-sky-500 transition-colors duration-300 hover:bg-sky-50 rounded-lg">
                <Search size={20} />
              </button>

              {/* Wishlist */}
              <button className="p-2 text-gray-600 hover:text-red-500 transition-colors duration-300 hover:bg-red-50 rounded-lg relative">
                <Heart size={20} />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  3
                </span>
              </button>


              {/* Hidden Admin Access */}
              <button
                onClick={() => onNavigate('admin')}
                className="p-2 text-transparent hover:text-gray-400 transition-colors duration-300 hover:bg-gray-50 rounded-lg opacity-0 hover:opacity-100"
                title="Admin Access"
              >
                <Shield size={20} />
              </button>

              {/* CTA Button */}
              <LuxuryButton
                variant="gradient"
                size="sm"
                onClick={() => onNavigate('packages')}
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
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-6 space-y-2 border-t border-gray-200">
            {navItems.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-sm font-medium transition-all duration-300 rounded-lg ${
                    currentPage === item.id
                      ? 'text-sky-500 bg-sky-50 border-l-4 border-sky-500'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.name}
                </button>
                
                {/* Mobile Dropdown */}
                {item.hasDropdown && (
                  <div className="ml-4 space-y-1">
                    {item.dropdownItems?.map((dropdownItem) => (
                      <button
                        key={dropdownItem.id}
                        onClick={() => {
                          onNavigate(dropdownItem.id);
                          setMobileMenuOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                      >
                        {dropdownItem.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Mobile Actions */}
            <div className="px-4 pt-4 space-y-3 border-t border-gray-200">
              <div className="flex items-center space-x-4">
                <button className="flex items-center space-x-2 text-gray-600 hover:text-red-500 transition-colors">
                  <Heart size={18} />
                  <span className="text-sm">Wishlist (3)</span>
                </button>
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
      </nav>
    </header>
  );
}
