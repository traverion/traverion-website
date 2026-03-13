import { ArrowRight } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';

export default function AurinkoStyleSaleBanner() {
  const { t } = useTranslation();
  const destinations = [
    { name: 'Vietnam', price: '€1,299' },
    { name: 'Thailand', price: '€1,499' },
    { name: 'Cambodia', price: '€999' },
    { name: 'Indochina', price: '€2,299' }
  ];

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Main Sale Banner */}
        <div className="bg-finland rounded-2xl shadow-2xl overflow-hidden relative">
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{
              backgroundImage: 'url(/vietnam1.jpg)',
            }}
          />
          
          {/* Decorative Corner */}
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/10 transform rotate-45 translate-x-16 translate-y-16"></div>
          
          <div className="relative z-10 p-8 md:p-12">
            {/* Top Tag */}
            <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg mb-6">
              <span className="text-white font-medium text-sm">
                {t.promotions?.earlyBooking || 'Limited Time Offer'}
              </span>
            </div>

            {/* Main Offer */}
            <div className="mb-8">
              <h2 className="text-4xl md:text-5xl font-light text-white mb-2">
                {t.promotions?.lastMinute || 'SALE! Holidays from'}{' '}
                <span className="text-6xl md:text-7xl font-bold text-white">€999</span>
              </h2>
              <p className="text-xl text-white/90 font-light">
                {t.promotions?.lastMinuteSubtitle || 'Dream destinations now at campaign prices'}
              </p>
            </div>

            {/* Call to Action Button */}
            <button className="bg-white text-finland px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl mb-8">
              {t.promotions?.bookNow || 'Book Now'}
            </button>

            {/* Destination Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {destinations.map((dest, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl p-4 hover:shadow-lg transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-700 font-medium text-sm mb-1">{dest.name}</p>
                      <p className="text-finland font-semibold text-lg">{dest.price}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-finland transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

