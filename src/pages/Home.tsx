import { Plane, Globe, Shield, Star, ArrowRight, Play, Award, Users, TrendingUp, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import PackageCard from '../components/PackageCard';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import SimpleMap from '../components/SimpleMap';
import TravelSearch from '../components/TravelSearch';
import FeaturedDestinations from '../components/FeaturedDestinations';
import TUIHeroSection from '../components/TUIHeroSection';
import AurinkoStyleSaleBanner from '../components/AurinkoStyleSaleBanner';
import { tourPackages } from '../data/tours';
import { useTranslation } from '../contexts/TranslationContext';
import { TourPackage } from '../types/tour';

interface HomeProps {
  onTourSelect: (tour: TourPackage) => void;
  onNavigate?: (page: string) => void;
}

export default function Home({ onTourSelect, onNavigate }: HomeProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Get featured packages from our real tour data
  const featuredPackages = tourPackages
    .filter(tour => tour.isPopular)
    .slice(0, 3)
    .map(tour => ({
      title: tour.title,
      destination: tour.destination,
      duration: tour.duration,
      groupSize: tour.groupSize,
      price: `$${tour.price.twin}`,
      image: tour.image,
      description: tour.description,
      rating: tour.rating,
      reviews: tour.reviews,
      isPopular: tour.isPopular,
      discount: tour.discount,
    }));



  return (
    <div className="min-h-screen bg-white">
      {/* TUI-Style Hero Section with Integrated Search */}
      <TUIHeroSection onSearch={(searchData) => {
        console.log('Search data:', searchData);
        // Handle search logic here
      }} />

      {/* Aurinko-Style Sale Banner */}
      <AurinkoStyleSaleBanner />

      {/* Featured Destinations */}
      <FeaturedDestinations onNavigate={onNavigate} />
    </div>
  );
}
