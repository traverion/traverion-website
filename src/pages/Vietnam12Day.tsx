import BeautifulTourPackage from './BeautifulTourPackage';

interface Vietnam12DayProps {
  onBack: () => void;
}

export default function Vietnam12Day({ onBack }: Vietnam12DayProps) {
  return <BeautifulTourPackage tourId="vietnam-complete-12-days" onBack={onBack} />;
}


