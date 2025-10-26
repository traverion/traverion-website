import { useState, useEffect } from 'react';
import CleanTourLayout from '../components/CleanTourLayout';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';

interface Indochina14DayProps {
  onBack: () => void;
}

export default function Indochina14Day({ onBack }: Indochina14DayProps) {
  const [tour, setTour] = useState<TourPackage | null>(null);

  useEffect(() => {
    const foundTour = tourPackages.find(t => t.id === 'indochina-14-days');
    setTour(foundTour || null);
  }, []);

  if (!tour) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return <CleanTourLayout tour={tour} onBack={onBack} />;
}


