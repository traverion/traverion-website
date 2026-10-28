import PickupCoverageMap from '../PickupCoverageMap';
import { rentalMapHref } from '../../../lib/rental-presentation';

export default function RentalCollectionMap({
  lat,
  lng,
  interactive = false,
  onMove,
  label = 'Collection point map',
  compact = false,
}: {
  lat: number;
  lng: number;
  interactive?: boolean;
  onMove?: (point: { lat: number; lng: number }) => void;
  label?: string;
  /** Shorter map for review layouts so it does not dominate the page. */
  compact?: boolean;
}) {
  const href = rentalMapHref(lat, lng);
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <PickupCoverageMap
        lat={lat}
        lng={lng}
        radiusKm={null}
        marker={{ lat, lng }}
        showRadius={false}
        pinZoom={16}
        draggable={interactive}
        onMarkerDrag={interactive ? onMove : undefined}
        onMapClick={interactive ? onMove : undefined}
        gestureHandling={interactive ? 'greedy' : 'cooperative'}
        ariaLabel={label}
        fallback="The map could not be loaded. The saved address is unchanged."
        className={
          compact
            ? 'h-36 w-full overflow-hidden rounded-xl border border-[#E6EAF0] bg-[#F4F6F8] sm:h-40'
            : 'h-52 w-full overflow-hidden rounded-2xl border border-[#E6EAF0] bg-[#F4F6F8] sm:h-64'
        }
      />
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-[#073b83] underline-offset-2 hover:underline">
          Open this point in maps
        </a>
      ) : null}
    </div>
  );
}
