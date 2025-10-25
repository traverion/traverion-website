import { useState } from 'react';
import { Search, Calendar, MapPin, Users, Plane } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';

interface SearchFormData {
  destination: string;
  departureDate: string;
  returnDate: string;
  travelers: number;
  tripType: 'package' | 'flight' | 'hotel';
}

const destinations = [
  'Vietnam', 'Thailand', 'Cambodia', 'Laos', 'Myanmar', 
  'Indonesia', 'Malaysia', 'Singapore', 'Philippines', 'Japan'
];

const tripTypes = [
  { id: 'package', label: 'Lomamatkat', icon: <Plane className="w-5 h-5" /> },
  { id: 'flight', label: 'Lennot', icon: <Plane className="w-5 h-5" /> },
  { id: 'hotel', label: 'Pelkkä hotelli', icon: <MapPin className="w-5 h-5" /> }
];

export default function TravelSearch() {
  const [searchData, setSearchData] = useState<SearchFormData>({
    destination: '',
    departureDate: '',
    returnDate: '',
    travelers: 2,
    tripType: 'package'
  });

  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);

  const handleSearch = () => {
    console.log('Searching with:', searchData);
    // Implement search logic here
  };

  const filteredDestinations = destinations.filter(dest =>
    dest.toLowerCase().includes(searchData.destination.toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-100">
      {/* Trip Type Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 rounded-xl p-1">
        {tripTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => setSearchData(prev => ({ ...prev, tripType: type.id as any }))}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg transition-all duration-300 ${
              searchData.tripType === type.id
                ? 'bg-white text-sky-600 shadow-sm'
                : 'text-gray-600 hover:text-sky-600'
            }`}
          >
            {type.icon}
            <span className="font-medium">{type.label}</span>
          </button>
        ))}
      </div>

      {/* Search Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Destination */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Määränpää
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
              placeholder="Valitse määränpää"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Lähtöpäivä
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={searchData.departureDate}
              onChange={(e) => setSearchData(prev => ({ ...prev, departureDate: e.target.value }))}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
            />
          </div>
        </div>

        {/* Return Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paluupäivä
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={searchData.returnDate}
              onChange={(e) => setSearchData(prev => ({ ...prev, returnDate: e.target.value }))}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
            />
          </div>
        </div>

        {/* Travelers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Matkustajat
          </label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={searchData.travelers}
              onChange={(e) => setSearchData(prev => ({ ...prev, travelers: parseInt(e.target.value) }))}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors appearance-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                <option key={num} value={num}>
                  {num} {num === 1 ? 'henkilö' : 'henkilöä'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Search Button */}
      <div className="mt-6">
        <LuxuryButton
          variant="gradient"
          size="lg"
          onClick={handleSearch}
          className="w-full md:w-auto"
        >
          <Search className="w-5 h-5 mr-2" />
          Hae Matkoja
        </LuxuryButton>
      </div>

      {/* Quick Filters */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 mr-2">Suositukset:</span>
          {['Viime hetken matkat', 'Varhaisvaraus', 'Luksusmatkat', 'Perhematkat'].map((filter) => (
            <button
              key={filter}
              className="px-3 py-1 text-sm bg-sky-50 text-sky-600 rounded-full hover:bg-sky-100 transition-colors"
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

