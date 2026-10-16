import { useEffect, useRef, useState } from 'react';
import { googleMapsBrowserKey } from '../../lib/places-client';

type GoogleLatLng = { lat: number; lng: number };
type GoogleMap = {
  fitBounds: (bounds: GoogleBounds) => void;
  setCenter: (center: GoogleLatLng) => void;
};
type GoogleBounds = { extend: (point: GoogleLatLng) => void };
type GoogleCircle = {
  setCenter: (center: GoogleLatLng) => void;
  setRadius: (meters: number) => void;
  setMap: (map: GoogleMap | null) => void;
  getBounds: () => GoogleBounds | null;
};
type GoogleMapsNamespace = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
  Circle: new (opts: Record<string, unknown>) => GoogleCircle;
  LatLngBounds: new () => GoogleBounds;
};

declare global {
  interface Window {
    google?: { maps?: GoogleMapsNamespace };
  }
}

let mapsLoader: Promise<void> | null = null;

function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsLoader = null;
      reject(new Error('map'));
    };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

type Props = {
  lat: number;
  lng: number;
  radiusKm: number | null;
};

export default function PickupCoverageMap({ lat, lng, radiusKm }: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const circleRef = useRef<GoogleCircle | null>(null);
  const [failed, setFailed] = useState(false);
  const key = googleMapsBrowserKey();

  useEffect(() => {
    if (!key || !nodeRef.current) return;
    let cancelled = false;
    void loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !nodeRef.current || !window.google?.maps) return;
        const maps = window.google.maps;
        if (!mapRef.current) {
          mapRef.current = new maps.Map(nodeRef.current, {
            center: { lat, lng },
            zoom: 10,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            gestureHandling: 'cooperative',
          });
        }
        mapRef.current.setCenter({ lat, lng });
        if (radiusKm != null && radiusKm >= 1) {
          if (!circleRef.current) {
            circleRef.current = new maps.Circle({
              map: mapRef.current,
              center: { lat, lng },
              radius: radiusKm * 1000,
              fillColor: '#073B83',
              fillOpacity: 0.14,
              strokeColor: '#073B83',
              strokeOpacity: 0.9,
              strokeWeight: 1.5,
            });
          } else {
            circleRef.current.setMap(mapRef.current);
            circleRef.current.setCenter({ lat, lng });
            circleRef.current.setRadius(radiusKm * 1000);
          }
          const bounds = circleRef.current.getBounds();
          if (bounds) mapRef.current.fitBounds(bounds);
        } else if (circleRef.current) {
          circleRef.current.setMap(null);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, lat, lng, radiusKm]);

  if (!key) return null;
  if (failed) {
    return (
      <p className="text-[12px] text-ink-muted" role="status">
        The coverage map could not be loaded. The saved center and radius are unchanged.
      </p>
    );
  }
  return (
    <div
      ref={nodeRef}
      className="h-48 w-full overflow-hidden rounded-xl border border-black/10 bg-paper"
      role="img"
      aria-label={
        radiusKm != null
          ? `Pickup coverage map, ${radiusKm} kilometre radius`
          : 'Pickup center map'
      }
    />
  );
}
