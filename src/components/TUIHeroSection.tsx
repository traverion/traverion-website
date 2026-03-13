import { useState, useEffect } from 'react';
import { Search, Calendar, MapPin } from 'lucide-react';

interface TUIHeroSectionProps {
  onSearch: (searchData: any) => void;
}

export default function TUIHeroSection({ onSearch }: TUIHeroSectionProps) {
  const [searchData, setSearchData] = useState({
    destination: '',
    departureDate: ''
  });
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
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden pt-20">
      {/* Background Images - smooth crossfade */}
      {heroImages.map((image, index) => (
        <div
          key={image}
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ease-out ${
            index === currentImageIndex ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${image})` }}
          onError={(e) => {
            e.currentTarget.style.backgroundImage = 'linear-gradient(135deg, #003580 0%, #002F6C 100%)';
          }}
        />
      ))}
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6">
        {/* Airbnb/GetYourGuide style: one line, minimal */}
        <h1 className="text-center text-white text-4xl md:text-5xl font-semibold mb-3 hero-fade-in">
          Find tours & activities
        </h1>
        <p className="text-center text-white/90 text-lg mb-10 hero-fade-in hero-fade-in-delay-1">
          Book the best experiences. Free cancellation.
        </p>

        {/* Single search pill - Airbnb style */}
        <div className="hero-fade-in hero-fade-in-delay-2 bg-white rounded-full shadow-xl flex flex-col sm:flex-row overflow-hidden">
          <div className="flex-1 flex items-center gap-3 px-5 py-4 sm:py-3 border-b sm:border-b-0 sm:border-r border-gray-100">
            <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-500">Where</label>
              <select
                value={searchData.destination}
                onChange={(e) => setSearchData(prev => ({ ...prev, destination: e.target.value }))}
                className="w-full text-gray-900 font-medium bg-transparent border-none p-0 focus:ring-0 focus:outline-none text-sm sm:text-base"
              >
                <option value="">Search destinations</option>
                <option value="Vietnam">Vietnam</option>
                <option value="Thailand">Thailand</option>
                <option value="Cambodia">Cambodia</option>
                <option value="Vietnam & Thailand">Vietnam & Thailand</option>
                <option value="All Southeast Asia">All Southeast Asia</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-4 sm:py-3 border-b sm:border-b-0 sm:border-r border-gray-100 flex-shrink-0">
            <Calendar className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <label className="block text-xs font-medium text-gray-500">When</label>
              <input
                type="date"
                value={searchData.departureDate}
                onChange={(e) => setSearchData(prev => ({ ...prev, departureDate: e.target.value }))}
                className="text-gray-900 font-medium bg-transparent border-none p-0 text-sm sm:text-base focus:ring-0 focus:outline-none w-full"
              />
            </div>
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="m-2 sm:m-1.5 px-6 py-3 rounded-full bg-finland text-white font-semibold hover:bg-finland-dark transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSearching ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            <span>Search</span>
          </button>
        </div>

        {/* Minimal trust line */}
        <p className="text-center text-white/80 text-sm mt-6 hero-fade-in hero-fade-in-delay-3">
          Instant confirmation · Best price guarantee
        </p>
      </div>
    </section>
  );
}
