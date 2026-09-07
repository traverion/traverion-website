import { Compass } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import {
  reservedInventoryCopy,
  type InventoryFamily,
} from '../lib/inventory';

type Props = {
  family: Exclude<InventoryFamily, 'tour' | 'stay'>;
  onNavigate: (page: string) => void;
};

/** Honest placeholder for inventory that is architected but not sold yet. */
export default function ReservedInventoryPage({ family, onNavigate }: Props) {
  const copy = reservedInventoryCopy(family);
  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-lg mx-auto px-4 py-16">
        <EmptyState
          icon={Compass}
          title={copy.title}
          body={copy.body}
          action={
            <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
              Browse tours
            </button>
          }
        />
      </div>
    </div>
  );
}
