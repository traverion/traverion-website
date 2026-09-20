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
      <div className="max-w-lg mx-auto px-4 py-8 pb-12">
        <div className="mb-5 rounded-xl bg-finland/8 px-3.5 py-2.5 ring-1 ring-finland/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-finland m-0">Coming later</p>
          <p className="mt-1 text-sm text-ink leading-relaxed m-0">
            This category is reserved in the product map — not for sale yet.
          </p>
        </div>
        <div className="tv-card px-4 py-2 sm:px-5">
          <EmptyState
            icon={Compass}
            title={copy.title}
            body={copy.body}
            action={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('packages')} className="tv-btn-primary">
                  Browse tours
                </button>
                <button type="button" onClick={() => onNavigate('stays')} className="tv-btn-ghost">
                  Browse stays
                </button>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
