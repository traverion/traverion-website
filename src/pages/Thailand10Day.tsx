import BeautifulTourPackage from './BeautifulTourPackage';

interface Thailand10DayProps {
  onBack: () => void;
}

export default function Thailand10Day({ onBack }: Thailand10DayProps) {
  return <BeautifulTourPackage tourId="thailand-10-days" onBack={onBack} />;
}


