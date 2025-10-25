import BeautifulTourPackage from './BeautifulTourPackage';

interface Cambodia10DayProps {
  onBack: () => void;
}

export default function Cambodia10Day({ onBack }: Cambodia10DayProps) {
  return <BeautifulTourPackage tourId="cambodia-10-days" onBack={onBack} />;
}


