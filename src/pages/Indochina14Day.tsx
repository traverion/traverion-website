import BeautifulTourPackage from './BeautifulTourPackage';

interface Indochina14DayProps {
  onBack: () => void;
}

export default function Indochina14Day({ onBack }: Indochina14DayProps) {
  return <BeautifulTourPackage tourId="indochina-14-days" onBack={onBack} />;
}


