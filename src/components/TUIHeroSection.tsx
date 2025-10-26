import { useState, useEffect } from 'react';
import { Search, Calendar, MapPin, Users, Plane, Star, Clock, Shield, Award } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

interface TUIHeroSectionProps {
  onSearch: (searchData: any) => void;
}

export default function TUIHeroSection({ onSearch }: TUIHeroSectionProps) {
  const { t } = useTranslation();
  const [searchData, setSearchData] = useState({
    departure: '',
    destination: '',
    departureDate: '',
    duration: '',
    travelers: 2,
    tripType: 'package'
  });

  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);
  const [showDepartureDropdown, setShowDepartureDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Array of travel destination images
  const heroImages = [
    '/vietnam1.jpg',
    '/thailand1.jpg', 
    '/cambodia1.jpg',
    '/laos1.jpg',
    '/myanmar1.jpg'
  ];

  // Cycle through images every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => 
        (prevIndex + 1) % heroImages.length
      );
    }, 8000);

    return () => clearInterval(interval);
  }, [heroImages.length]);

  const departureLocations = [
    'Helsinki', 'Turku', 'Tampere', 'Oulu', 'Rovaniemi',
    'Vaasa', 'Joensuu', 'Kuopio', 'Jyväskylä', 'Lahti'
  ];

  const destinations = [
    'Vietnam', 'Thailand', 'Cambodia', 'Laos', 'Myanmar', 
    'Indonesia', 'Malaysia', 'Singapore', 'Philippines', 'Japan',
    'Bangkok', 'Ho Chi Minh City', 'Hanoi', 'Phnom Penh', 'Vientiane'
  ];

  const durationOptions = [
    { value: '7', label: '1 week' },
    { value: '10', label: '10 days' },
    { value: '14', label: '2 weeks' },
    { value: '21', label: '3 weeks' },
    { value: '30', label: '1 month' }
  ];

  const tripTypes = [
    { id: 'package', label: t.search.tripTypes.package, icon: <Plane className="w-5 h-5" /> }
  ];

  const filteredDestinations = destinations.filter(dest =>
    dest.toLowerCase().includes(searchData.destination.toLowerCase())
  );

  const filteredDepartures = departureLocations.filter(loc =>
    loc.toLowerCase().includes(searchData.departure.toLowerCase())
  );

  const handleSearch = () => {
    setIsSearching(true);
    // Simulate a brief search delay for better UX
    setTimeout(() => {
      // Navigate to packages page with search data
      onSearch({
        ...searchData,
        action: 'navigate',
        page: 'packages'
      });
      setIsSearching(false);
    }, 500);
  };

  return (
    <section className="relative min-h-[140vh] flex items-center justify-center overflow-hidden pt-20">
      {/* Background Images */}
      {heroImages.map((image, index) => (
        <div 
          key={image}
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ${
            index === currentImageIndex ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: `url(${image})`,
            backgroundAttachment: 'fixed',
          }}
          onError={(e) => {
            // Fallback to a solid gradient if image fails to load
            e.currentTarget.style.backgroundImage = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          }}
        />
      ))}
      {/* Additional overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/70" />
      
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Image Indicators */}
        <div className="absolute top-4 right-4 flex space-x-2 z-20">
          {heroImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentImageIndex 
                  ? 'bg-white scale-125' 
                  : 'bg-white/50 hover:bg-white/75'
              }`}
            />
          ))}
        </div>

        {/* Trusted Travel Partners Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-6 py-3 shadow-lg">
            <Shield className="w-5 h-5 text-white" />
            <span className="text-white font-light text-sm">Trusted Travel Partners</span>
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Award className="w-5 h-5 text-white" />
          </div>
        </div>

        <div className="text-center text-white mb-16">
          <h1 className="text-5xl md:text-7xl font-light mb-8">
            {t.hero.title}
          </h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto mb-12 font-light">
            {t.hero.subtitle}
          </p>
        </div>

        {/* TUI-Style Search Module */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-5xl mx-auto">
          {/* Search Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Departure Location */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                Departure Location
              </label>
              <div className="relative">
                <Plane className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchData.departure}
                  onChange={(e) => {
                    setSearchData(prev => ({ ...prev, departure: e.target.value }));
                    setShowDepartureDropdown(true);
                  }}
                  onFocus={() => setShowDepartureDropdown(true)}
                  placeholder="Select departure city"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors bg-white"
                />
                
                {/* Departure Dropdown */}
                {showDepartureDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                    {filteredDepartures.map((loc) => (
                      <button
                        key={loc}
                        onClick={() => {
                          setSearchData(prev => ({ ...prev, departure: loc }));
                          setShowDepartureDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-sky-50 transition-colors"
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Destination */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search.destination}
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchData.destination}
                  onChange={(e) => {
                    setSearchData(prev => ({ ...prev, destination: e.target.value }));
                    setShowDestinationDropdown(true);
                  }}
                  onFocus={() => setShowDestinationDropdown(true)}
                  placeholder={t.search.selectDestination}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors bg-white"
                />
                
                {/* Destination Dropdown */}
                {showDestinationDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                    {filteredDestinations.map((dest) => (
                      <button
                        key={dest}
                        onClick={() => {
                          setSearchData(prev => ({ ...prev, destination: dest }));
                          setShowDestinationDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-sky-50 transition-colors"
                      >
                        {dest}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Departure Date */}
            <div>
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search.departureDate}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={searchData.departureDate}
                  onChange={(e) => setSearchData(prev => ({ ...prev, departureDate: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors bg-white"
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-light text-gray-700 mb-2">
                Trip Duration
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={searchData.duration}
                  onChange={(e) => setSearchData(prev => ({ ...prev, duration: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors appearance-none bg-white"
                >
                  <option value="">Select duration</option>
                  {durationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Second Row - Travelers and Search Button */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Travelers */}
            <div>
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search.travelers}
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={searchData.travelers}
                  onChange={(e) => setSearchData(prev => ({ ...prev, travelers: parseInt(e.target.value) }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors appearance-none bg-white"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? t.search.person : t.search.people}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Button */}
            <div className="flex items-end">
              <LuxuryButton
                variant="gradient"
                size="lg"
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full py-3 text-lg font-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? (
                  <div className="w-5 h-5 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Search className="w-5 h-5 mr-2" />
                )}
                {isSearching ? 'Searching...' : t.search.searchTrips}
              </LuxuryButton>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
