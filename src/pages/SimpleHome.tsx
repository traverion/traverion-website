import { useTranslation } from '../contexts/TranslationContext';
import TUIHeroSection from '../components/TUIHeroSection';
import AurinkoStyleSaleBanner from '../components/AurinkoStyleSaleBanner';
import FeaturedDestinations from '../components/FeaturedDestinations';

interface SimpleHomeProps {
  onTourSelect: (tour: any) => void;
  onNavigate?: (page: string) => void;
}

export default function SimpleHome({ onTourSelect, onNavigate }: SimpleHomeProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white pt-32">
      {/* Hero Section with Search */}
      <TUIHeroSection onSearch={(searchData) => {
        console.log('Search data:', searchData);
        // Navigate to packages page with search filters
        if (onNavigate && searchData.action === 'navigate') {
          onNavigate(searchData.page || 'packages');
        }
      }} />

      {/* Aurinko-Style Sale Banner */}
      <AurinkoStyleSaleBanner />

      {/* Featured Destinations */}
      <FeaturedDestinations onNavigate={onNavigate} />

    </div>
  );
}
