import TraverionLocationSelector from './TraverionLocationSelector';
import type { VerifiedDestination } from '../../lib/destination-place';

type Props = {
  id: string;
  selected: VerifiedDestination | null;
  savedLabel: string;
  onSelect: (place: VerifiedDestination) => void;
  onClear?: () => void;
};

/** Tour, ticket, and transportation destination field. Same search as every other creator. */
export default function DestinationSearch({ id, selected, savedLabel, onSelect, onClear }: Props) {
  return (
    <TraverionLocationSelector
      id={id}
      selected={selected}
      savedLabel={savedLabel}
      onSelect={onSelect}
      onClear={onClear}
      label="City / destination *"
      placeholder="Rovaniemi, Finland"
    />
  );
}
