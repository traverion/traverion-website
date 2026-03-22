import { Search } from 'lucide-react';
import { useState } from 'react';

export default function Destinations() {
  const [searchTerm, setSearchTerm] = useState('');

  const destinations = [
    {
      name: 'Greece',
      image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
      packages: 12,
      description: 'Ancient history meets stunning island beauty',
    },
    {
      name: 'Japan',
      image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
      packages: 15,
      description: 'Where tradition harmonizes with innovation',
    },
    {
      name: 'Indonesia',
      image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
      packages: 10,
      description: 'Tropical paradise with rich cultural heritage',
    },
    {
      name: 'Italy',
      image: 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg',
      packages: 18,
      description: 'Renaissance art, cuisine, and timeless romance',
    },
    {
      name: 'Thailand',
      image: 'https://images.pexels.com/photos/1007426/pexels-photo-1007426.jpeg',
      packages: 14,
      description: 'Exotic temples and pristine beaches',
    },
    {
      name: 'Iceland',
      image: 'https://images.pexels.com/photos/2437299/pexels-photo-2437299.jpeg',
      packages: 8,
      description: 'Land of fire, ice, and northern lights',
    },
    {
      name: 'Spain',
      image: 'https://images.pexels.com/photos/1388030/pexels-photo-1388030.jpeg',
      packages: 16,
      description: 'Vibrant culture, architecture, and gastronomy',
    },
    {
      name: 'New Zealand',
      image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
      packages: 9,
      description: 'Breathtaking landscapes and adventure awaits',
    },
    {
      name: 'Portugal',
      image: 'https://images.pexels.com/photos/2868252/pexels-photo-2868252.jpeg',
      packages: 11,
      description: 'Coastal charm and historic treasures',
    },
  ];

  const filteredDestinations = destinations.filter((dest) =>
    dest.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white pt-20">
      <section className="relative h-96 flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
          }}
        />
        <div className="absolute inset-0 bg-black/50" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold !text-white mb-4 drop-shadow-md">
            Explore Destinations
          </h1>
          <p className="text-xl !text-white/95 drop-shadow-md [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
            Discover your next adventure from our curated selection of worldwide destinations
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto mb-12">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search destinations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredDestinations.map((destination, index) => (
              <div
                key={index}
                className="group relative bg-white rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 cursor-pointer"
              >
                <div className="relative h-80 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                    style={{ backgroundImage: `url(${destination.image})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <h3 className="text-3xl font-bold text-white mb-2">{destination.name}</h3>
                    <p className="text-white/90 text-sm mb-3">{destination.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sky-300 text-sm font-medium">
                        {destination.packages} packages available
                      </span>
                      <button className="bg-white text-sky-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-50 transition-colors">
                        Explore
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredDestinations.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No destinations found matching your search.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
