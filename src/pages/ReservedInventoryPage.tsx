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
        <div className="mb-6 rounded-2xl bg-finland/8 px-4 py-3 ring-1 ring-finland/15">
          <p className="text-[11px] uppercase tracking-[0.16em] text-finland/80 m-0">Coming later</p>
          <p className="mt-1 text-sm text-ink leading-relaxed m-0">
            This category is reserved in the product map — not for sale yet.
          </p>
        </div>
        <div className="rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-6">
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
    </div>
  );
}
