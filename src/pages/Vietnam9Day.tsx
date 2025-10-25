import BeautifulTourPackage from './BeautifulTourPackage';

interface Vietnam9DayProps {
  onBack: () => void;
}

export default function Vietnam9Day({ onBack }: Vietnam9DayProps) {
  return <BeautifulTourPackage tourId="vietnam-southern-9-days" onBack={onBack} />;
}


