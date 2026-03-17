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
          className="flex-1 bg-white border-2 border-finland text-finland px-4 py-3 rounded-xl font-medium shadow-soft hover:bg-finland/5 transition-all duration-200 ease-smooth active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Phone className="w-5 h-5" />
          <span className="text-sm">Call</span>
        </a>

        {/* Book Tours Button */}
        <button
          onClick={() => onNavigate?.('packages')}
          className="flex-1 bg-finland text-white px-4 py-3 rounded-xl font-medium shadow-soft hover:bg-finland-dark transition-all duration-200 ease-smooth active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Calendar className="w-5 h-5" />
          <span className="text-sm">Find Tours</span>
        </button>
      </div>
    </div>
  );
}

