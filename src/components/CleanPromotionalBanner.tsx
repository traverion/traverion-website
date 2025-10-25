import LuxuryButton from './ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

export default function CleanPromotionalBanner() {
  const { t } = useTranslation();
  
  const promotions = [
    {
      id: '1',
      title: t.promotions.lastMinute,
      subtitle: t.promotions.lastMinuteSubtitle,
      discount: '-40%',
      cta: t.promotions.exploreOffers
    },
    {
      id: '2',
      title: t.promotions.earlyBooking,
      subtitle: t.promotions.earlyBookingSubtitle,
      discount: '-30%',
      cta: t.promotions.bookNow
    },
    {
      id: '3',
      title: t.promotions.luxuryExperience,
      subtitle: t.promotions.luxurySubtitle,
      discount: 'VIP',
      cta: t.promotions.exploreLuxury
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-gradient-to-r from-slate-800 via-gray-900 to-slate-800 text-white py-3 shadow-2xl border-t border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-3 py-1 rounded-full text-sm font-bold">
              -40%
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {t.promotions.lastMinute}
              </h3>
              <p className="text-sm text-gray-200">
                {t.promotions.lastMinuteSubtitle}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button className="bg-white text-slate-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              {t.promotions.exploreOffers}
            </button>
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <span className="text-white">×</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
