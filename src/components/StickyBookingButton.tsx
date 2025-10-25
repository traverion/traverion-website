import { Phone, Calendar } from 'lucide-react';

interface StickyBookingButtonProps {
  onNavigate?: (page: string) => void;
}

export default function StickyBookingButton({ onNavigate }: StickyBookingButtonProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 lg:hidden">
      <div className="flex gap-2 max-w-md mx-auto">
        {/* Phone Button */}
        <a
          href="tel:+3584578345138"
          className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-3 rounded-xl font-light shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
        >
          <Phone className="w-5 h-5" />
          <span className="text-sm">Call</span>
        </a>

        {/* Book Button */}
        <button
          onClick={() => onNavigate?.('contact')}
          className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-3 rounded-xl font-light shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
        >
          <Calendar className="w-5 h-5" />
          <span className="text-sm">Book Now</span>
        </button>
      </div>
    </div>
  );
}

