import { useEffect, useRef, useState } from 'react';
import { googleMapsBrowserKey } from '../../lib/places-client';

type GoogleLatLng = { lat: number; lng: number };
type GoogleMapClick = { latLng?: { lat: () => number; lng: () => number } | null };
type GoogleMap = {
  fitBounds: (bounds: GoogleBounds) => void;
  setCenter: (center: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
  addListener: (event: string, handler: (event?: GoogleMapClick) => void) => void;
};
type GoogleBounds = { extend: (point: GoogleLatLng) => void };
type GoogleCircle = {
  setCenter: (center: GoogleLatLng) => void;
  setRadius: (meters: number) => void;
  setMap: (map: GoogleMap | null) => void;
  getBounds: () => GoogleBounds | null;
};
type GoogleMarker = {
  setPosition: (position: GoogleLatLng) => void;
  setMap: (map: GoogleMap | null) => void;
  setDraggable: (draggable: boolean) => void;
  addListener: (event: string, handler: () => void) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
};
type GoogleMapsNamespace = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
  Circle: new (opts: Record<string, unknown>) => GoogleCircle;
  Marker: new (opts: Record<string, unknown>) => GoogleMarker;
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
  marker?: { lat: number; lng: number } | null;
  fallback?: string;
  draggable?: boolean;
  onMarkerDrag?: (point: { lat: number; lng: number }) => void;
  /** Street-level view of the pickup pin. Skips fitting the whole coverage radius. */
  pinZoom?: number | null;
  showRadius?: boolean;
  className?: string;
  /** Clicking the map reports a point. The caller decides whether the address text changes. */
  onMapClick?: (point: GoogleLatLng) => void;
  gestureHandling?: 'greedy' | 'cooperative';
  ariaLabel?: string;
};

export default function PickupCoverageMap({
  lat,
  lng,
  radiusKm,
  marker = null,
  fallback,
  draggable = false,
  onMarkerDrag,
  pinZoom = null,
  showRadius = true,
  className,
  onMapClick,
  gestureHandling = 'cooperative',
  ariaLabel,
}: Props) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const circleRef = useRef<GoogleCircle | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const onDragRef = useRef(onMarkerDrag);
  onDragRef.current = onMarkerDrag;
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;
  const gestureRef = useRef(gestureHandling);
  const [failed, setFailed] = useState(false);
  const key = googleMapsBrowserKey();
  const markerLat = marker?.lat;
  const markerLng = marker?.lng;

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
            gestureHandling: gestureRef.current,
          });
          mapRef.current.addListener('click', (event) => {
            const pos = event?.latLng;
            if (!pos || !onClickRef.current) return;
            onClickRef.current({ lat: pos.lat(), lng: pos.lng() });
          });
        }
        const focus = markerLat != null && markerLng != null ? { lat: markerLat, lng: markerLng } : { lat, lng };
        mapRef.current.setCenter(focus);
        const drawRadius = showRadius && radiusKm != null && radiusKm >= 1;
        if (pinZoom != null) mapRef.current.setZoom(pinZoom);
        if (drawRadius && radiusKm != null) {
          if (!circleRef.current) {
            circleRef.current = new maps.Circle({
              map: mapRef.current,
              center: { lat, lng },
              radius: radiusKm * 1000,
              fillColor: '#073B83',
              fillOpacity: 0.12,
              strokeColor: '#073B83',
              strokeOpacity: 0.7,
              strokeWeight: 1,
            });
          } else {
            circleRef.current.setMap(mapRef.current);
            circleRef.current.setCenter({ lat, lng });
            circleRef.current.setRadius(radiusKm * 1000);
          }
          if (pinZoom == null) {
            const bounds = circleRef.current.getBounds();
            if (bounds) {
              if (markerLat != null && markerLng != null && Number.isFinite(markerLat) && Number.isFinite(markerLng)) {
                bounds.extend({ lat: markerLat, lng: markerLng });
              }
              mapRef.current.fitBounds(bounds);
            }
          }
        } else if (circleRef.current) {
          circleRef.current.setMap(null);
        }
        if (markerLat != null && markerLng != null && Number.isFinite(markerLat) && Number.isFinite(markerLng)) {
          const position = { lat: markerLat, lng: markerLng };
          if (!markerRef.current) {
            markerRef.current = new maps.Marker({
              map: mapRef.current,
              position,
              title: 'Selected pickup',
              draggable,
            });
            markerRef.current.addListener('dragend', () => {
              const pos = markerRef.current?.getPosition();
              if (!pos) return;
              onDragRef.current?.({ lat: pos.lat(), lng: pos.lng() });
            });
          } else {
            markerRef.current.setMap(mapRef.current);
            markerRef.current.setPosition(position);
            markerRef.current.setDraggable(draggable);
          }
        } else if (markerRef.current) {
          markerRef.current.setMap(null);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, lat, lng, markerLat, markerLng, radiusKm, draggable, pinZoom, showRadius]);

  if (!key) return null;
  if (failed) {
    return (
      <p className="text-[12px] text-ink-muted" role="status">
        {fallback ?? 'The coverage map could not be loaded. The saved center and radius are unchanged.'}
      </p>
    );
  }
  return (
    <div
      ref={nodeRef}
      className={className ?? 'h-48 w-full overflow-hidden rounded-lg border border-[#e5e7eb] bg-white'}
      role="img"
      aria-label={
        ariaLabel ??
        (radiusKm != null
          ? `Pickup coverage map, ${radiusKm} kilometre radius`
          : 'Pickup center map')
      }
    />
  );
}
