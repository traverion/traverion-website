import { useState, useEffect } from 'react';
import CleanTourLayout from '../components/CleanTourLayout';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';

interface Vietnam9DayProps {
  onBack: () => void;
}

export default function Vietnam9Day({ onBack }: Vietnam9DayProps) {
  const [tour, setTour] = useState<TourPackage | null>(null);

  useEffect(() => {
    const foundTour = tourPackages.find(t => t.id === 'vietnam-southern-9-days');
    setTour(foundTour || null);
  }, []);

  if (!tour) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return <CleanTourLayout tour={tour} onBack={onBack} />;
}


