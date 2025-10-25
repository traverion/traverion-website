import { useState } from 'react';
import { Star, MapPin, Clock, ArrowRight, Plane, Hotel, Camera } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import LuxuryButton from './ui/LuxuryButton';

export default function SaleBanner() {
  const { t } = useTranslation();
  const [currentPromotion, setCurrentPromotion] = useState(0);

  const promotions = [
    {
      id: 1,
      title: "Early Bird Special",
      subtitle: "Book now and save up to 30%",
      discount: "30%",
      badge: "Limited Time",
      image: "/vietnam1.jpg",
      destinations: [
        { name: "Vietnam", price: "€1,299", originalPrice: "€1,899" },
        { name: "Thailand", price: "€1,199", originalPrice: "€1,699" },
        { name: "Cambodia", price: "€999", originalPrice: "€1,399" },
        { name: "Indochina", price: "€2,299", originalPrice: "€3,299" }
      ]
    },
    {
      id: 2,
      title: "Last Minute Deals",
      subtitle: "Spontaneous adventures await",
      discount: "40%",
      badge: "Last Chance",
      image: "/thailand1.jpg",
      destinations: [
        { name: "Bangkok", price: "€799", originalPrice: "€1,199" },
        { name: "Ho Chi Minh", price: "€899", originalPrice: "€1,399" },
        { name: "Siem Reap", price: "€699", originalPrice: "€1,099" },
        { name: "Hanoi", price: "€799", originalPrice: "€1,199" }
      ]
    }
  ];

  const currentOffer = promotions[currentPromotion];

  return (
    <section className="relative py-16 overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${currentOffer.image})`,
        }}
      />
      
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />
      
      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Main Offer */}
          <div className="text-white">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Clock className="w-4 h-4" />
              {currentOffer.badge}
            </div>

            {/* Main Heading */}
            <h2 className="text-4xl md:text-6xl font-light mb-4">
              {currentOffer.title}
            </h2>
            
            {/* Subtitle */}
            <p className="text-xl md:text-2xl text-white/90 mb-8 font-light">
              {currentOffer.subtitle}
            </p>

            {/* Discount Badge */}
            <div className="inline-flex items-center gap-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl px-6 py-4 mb-8">
              <div className="text-3xl font-light">
                -{currentOffer.discount}
              </div>
              <div className="text-sm text-white/80">
                OFF
              </div>
            </div>

            {/* CTA Button */}
            <LuxuryButton
              variant="gradient"
              size="lg"
              className="px-8 py-4 text-lg font-light"
            >
              Book Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </LuxuryButton>
          </div>

          {/* Right Side - Featured Destinations */}
          <div className="grid grid-cols-2 gap-4">
            {currentOffer.destinations.map((destination, index) => (
              <div
                key={index}
                className="bg-white/95 backdrop-blur-sm rounded-xl p-4 hover:bg-white transition-all duration-300 cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900 group-hover:text-sky-600 transition-colors">
                    {destination.name}
                  </h3>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-sky-600 transition-colors" />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-lg font-medium text-sky-600">
                    {destination.price}
                  </span>
                  <span className="text-sm text-gray-500 line-through">
                    {destination.originalPrice}
                  </span>
                </div>
                
                <div className="text-xs text-gray-500 mt-1">
                  per person
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Promotion Switcher */}
        <div className="flex justify-center mt-12">
          <div className="flex gap-2">
            {promotions.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPromotion(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  currentPromotion === index
                    ? 'bg-white scale-125'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

