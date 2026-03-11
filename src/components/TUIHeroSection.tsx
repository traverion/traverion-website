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
    if (!searchData.destination) {
      alert('Please select a destination to search');
      return;
    }

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

        {/* Enhanced Trust Badges */}
        <div className="flex flex-col items-center mb-8 space-y-4">
          {/* Main Trust Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-6 py-3 shadow-lg">
            <Shield className="w-5 h-5 text-white" />
            <span className="text-white font-medium text-sm">Trusted Travel Partners</span>
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <Award className="w-5 h-5 text-white" />
          </div>
          
          {/* Additional Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-white/80 text-sm">
            <div className="flex items-center gap-1">
              <Shield className="w-4 h-4" />
              <span>Secure Booking</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>24h Quote Response</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>500+ Happy Travelers</span>
            </div>
            <div className="flex items-center gap-1">
              <Award className="w-4 h-4" />
              <span>Premium Service</span>
            </div>
          </div>
        </div>

        <div className="text-center text-white mb-16">
          <h1 className="text-4xl md:text-6xl font-light mb-6">
            Book Tours & Activities
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-8 font-light">
            Find and book the best tours, day trips and experiences. Instant confirmation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <div className="bg-white/10 backdrop-blur-md rounded-full px-6 py-3">
              <span className="text-white font-medium">500+ tours worldwide</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-full px-6 py-3">
              <span className="text-white font-medium">Free cancellation</span>
            </div>
          </div>
        </div>

        {/* GetYourGuide-style search: destination + date */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Where do you want to go?</h2>
            <p className="text-gray-600">Search tours and activities by destination</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Destination */}
            <div className="relative md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destination
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={searchData.destination}
                  onChange={(e) => setSearchData(prev => ({ ...prev, destination: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors bg-white appearance-none"
                >
                  <option value="">Choose destination</option>
                  <option value="Vietnam">Vietnam</option>
                  <option value="Thailand">Thailand</option>
                  <option value="Cambodia">Cambodia</option>
                  <option value="Vietnam & Thailand">Vietnam & Thailand</option>
                  <option value="Vietnam & Cambodia">Vietnam & Cambodia</option>
                  <option value="All Southeast Asia">All Southeast Asia</option>
                </select>
              </div>
            </div>

            {/* Date (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When (optional)
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
          </div>

          <div className="mt-8 text-center">
            <LuxuryButton
              variant="gradient"
              size="lg"
              onClick={handleSearch}
              disabled={isSearching}
              className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white px-12 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {isSearching ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 w-5 h-5" />
                  Search Tours
                </>
              )}
            </LuxuryButton>
            <p className="text-sm text-gray-500 mt-3">
              Compare prices and book the best tours and activities
            </p>
          </div>
        </div>
      </div>

    </section>
  );
}
