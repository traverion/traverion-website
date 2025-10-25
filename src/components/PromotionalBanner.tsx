import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';

interface Promotion {
  id: string;
  title: string;
  subtitle: string;
  discount: string;
  backgroundImage: string;
  cta: string;
  validUntil: string;
}

export default function PromotionalBanner() {
  const { t } = useTranslation();
  
  const promotions: Promotion[] = [
    {
      id: '1',
      title: t.promotions.lastMinute,
      subtitle: t.promotions.lastMinuteSubtitle,
      discount: '-40%',
      backgroundImage: '/vietnam1.jpg',
      cta: t.promotions.exploreOffers,
      validUntil: '2024-12-31'
    },
    {
      id: '2', 
      title: t.promotions.earlyBooking,
      subtitle: t.promotions.earlyBookingSubtitle,
      discount: '-30%',
      backgroundImage: '/thailand1.jpg',
      cta: t.promotions.bookNow,
      validUntil: '2024-12-31'
    },
    {
      id: '3',
      title: t.promotions.luxuryExperience,
      subtitle: t.promotions.luxurySubtitle,
      discount: 'VIP',
      backgroundImage: '/cambodia1.jpg',
      cta: t.promotions.exploreLuxury,
      validUntil: '2024-12-31'
    }
  ];
  const [currentPromotion, setCurrentPromotion] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPromotion((prev) => (prev + 1) % promotions.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const nextPromotion = () => {
    setCurrentPromotion((prev) => (prev + 1) % promotions.length);
  };

  const prevPromotion = () => {
    setCurrentPromotion((prev) => (prev - 1 + promotions.length) % promotions.length);
  };

  if (!isVisible) return null;

  const promotion = promotions[currentPromotion];

  return (
    <div className="relative bg-gradient-to-r from-slate-800 via-gray-900 to-slate-800 text-white overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
        style={{
          backgroundImage: `url(${promotion.backgroundImage})`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-800/90 via-gray-900/90 to-slate-800/90" />
      
      {/* Content */}
      <div className="relative z-10 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Left Content */}
            <div className="flex-1">
              <div className="flex items-center space-x-4">
                <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse shadow-lg">
                  {promotion.discount}
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold">
                    {promotion.title}
                  </h3>
                  <p className="text-sm md:text-base text-gray-200">
                    {promotion.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <div className="hidden sm:block">
              <button className="bg-white text-sky-600 px-6 py-2 rounded-full font-semibold hover:bg-sky-50 transition-colors duration-300">
                {promotion.cta}
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={prevPromotion}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={nextPromotion}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div 
          className="h-full bg-white transition-all duration-100 ease-linear"
          style={{ width: `${((currentPromotion + 1) / promotions.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
