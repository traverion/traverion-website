import { useState, useEffect } from 'react';
import CleanTourLayout from '../components/CleanTourLayout';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';

interface Vietnam12DayProps {
  onBack: () => void;
}

export default function Vietnam12Day({ onBack }: Vietnam12DayProps) {
  const [tour, setTour] = useState<TourPackage | null>(null);

  useEffect(() => {
    const foundTour = tourPackages.find(t => t.id === 'vietnam-complete-12-days');
    setTour(foundTour || null);
  }, []);

  if (!tour) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return <CleanTourLayout tour={tour} onBack={onBack} />;
}


