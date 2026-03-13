import { useState } from 'react';
import { X, Search, MapPin, DollarSign, Calendar, Users, Filter } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (searchData: any) => void;
}

export default function SearchModal({ isOpen, onClose, onSearch }: SearchModalProps) {
  const { t } = useTranslation();
  const [searchData, setSearchData] = useState({
    destination: '',
    priceRange: '',
    departureDate: '',
    returnDate: '',
    travelers: 2,
    tripType: 'package'
  });

  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);

  // Available destinations based on your tours
  const destinations = [
    'Vietnam',
    'Thailand', 
    'Cambodia',
    'Laos',
    'Hanoi',
    'Ho Chi Minh City',
    'Bangkok',
    'Chiang Mai',
    'Phuket',
    'Siem Reap',
    'Phnom Penh',
    'Halong Bay',
    'Da Nang',
    'Hoi An',
    'Phu Quoc',
    'Mekong Delta'
  ];

  const priceRanges = [
    'Under €500',
    '€500 - €1000',
    '€1000 - €2000',
    '€2000 - €3000',
    '€3000+'
  ];

  const tripTypes = [
    { id: 'package', label: t.search?.tripTypes?.package || 'Holiday Packages', icon: <Search className="w-5 h-5" /> }
  ];

  const filteredDestinations = destinations.filter(dest =>
    dest.toLowerCase().includes(searchData.destination.toLowerCase())
  );

  const handleSearch = () => {
    onSearch(searchData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-light text-gray-900">Search tours & activities</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Search Form */}
        <div className="p-6 space-y-6">
          {/* Search Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Destination */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search?.destination || 'Destination'}
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
                  placeholder={t.search?.selectDestination || 'Select destination'}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-finland focus:border-finland transition-colors"
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
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-200"
                      >
                        {dest}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Price Range */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                Price Range
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <button
                  onClick={() => setShowPriceDropdown(!showPriceDropdown)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-finland focus:border-finland transition-colors text-left bg-white"
                >
                  {searchData.priceRange || 'Select price range'}
                </button>
                
                {/* Price Dropdown */}
                {showPriceDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                    {priceRanges.map((range) => (
                      <button
                        key={range}
                        onClick={() => {
                          setSearchData(prev => ({ ...prev, priceRange: range }));
                          setShowPriceDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-200"
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Departure Date */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search?.departureDate || 'Departure Date'}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={searchData.departureDate}
                  onChange={(e) => setSearchData(prev => ({ ...prev, departureDate: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-finland focus:border-finland transition-colors"
                />
              </div>
            </div>

            {/* Return Date */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search?.returnDate || 'Return Date'}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={searchData.returnDate}
                  onChange={(e) => setSearchData(prev => ({ ...prev, returnDate: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-finland focus:border-finland transition-colors"
                />
              </div>
            </div>

            {/* Travelers */}
            <div className="relative">
              <label className="block text-sm font-light text-gray-700 mb-2">
                {t.search?.travelers || 'Travelers'}
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={searchData.travelers}
                  onChange={(e) => setSearchData(prev => ({ ...prev, travelers: parseInt(e.target.value) }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-finland focus:border-finland transition-colors appearance-none bg-white"
                >
                  {Array.from({ length: 9 }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? t.search?.person || 'person' : t.search?.people || 'people'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Search Button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleSearch}
              className="bg-finland text-white px-8 py-4 rounded-xl font-medium text-lg hover:bg-finland-dark transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-3"
            >
              <Search className="w-5 h-5" />
              {t.search?.searchTrips || 'Search Tours'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
