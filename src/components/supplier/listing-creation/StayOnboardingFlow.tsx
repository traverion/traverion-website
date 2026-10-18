import { useEffect, useRef, useState } from 'react';
import { STAY_ONBOARDING_SCREENS, quietHoursMentioned, stayScreenIndex } from '../../../lib/stay-onboarding';
import { stayAmenityDisplayList } from '../../../lib/stay-amenities';
import { stayPropertyTypesForMode } from '../../../lib/stay-accommodation';
import { STAY_ARRIVAL_METHODS, stayArrivalMethodHint, stayArrivalMethodLabel } from '../../../lib/stay-arrival';
import { STAY_BED_KINDS, stayBedCount, stayMixFromAreas, staySleepCapacity, type StayBedKind, type StaySleepingArea } from '../../../lib/stay-beds';
import { activeStayOptions, emptyStayOption, newStayOptionId, type StayAccommodationOption } from '../../../lib/stay-options';
import { STAY_GUEST_CANCELLATION_POLICY } from '../../../types/listingExtras';
import { googleMapsBrowserKey } from '../../../lib/places-client';
import type { VerifiedDestination } from '../../../lib/destination-place';
import TraverionLocationSelector from '../TraverionLocationSelector';
import StayAmenityPicker from './StayAmenityPicker';
import StayBedroomPhotos from './StayBedroomPhotos';
import StayExampleQuote from './StayExampleQuote';
import ListingImageFields from '../ListingImageFields';
import { TraverionSingleDateField } from '../../calendar/TraverionSingleDateField';
import { localYmd } from '../../../lib/local-ymd';
import { stayCutoffAmounts, stayCutoffFromMinutes, stayCutoffSummary, stayCutoffToMinutes, type StayCutoffUnit } from '../../../lib/stay-cutoff';
import { composeStayCheckInAddress, stayAddressKey, stayPinMatchesAddress } from '../../../lib/stay-address';
import StayAddressSearch from './StayAddressSearch';

type PhotoSlot = string;
type Values = {
  city: string;
  country: string;
  destinationLat: number | null;
  destinationLng: number | null;
  stayLocationDisplayName: string;
  stayAddressStreet: string;
  stayAddressUnit: string;
  stayAddressPostal: string;
  stayAddressNotes: string;
  stayCheckInAddress: string;
  stayPinLat: number | null;
  stayPinLng: number | null;
  stayPinPlaceId: string;
  stayPinSource: '' | 'address' | 'adjusted';
  stayPinAddressKey: string;
  destinationPlaceId: string;
  destinationCountryCode: string;
  stayPropertyType: string;
  stayAccommodationMode: 'single' | 'multi';
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  stayAmenities: string;
  stayOptions: StayAccommodationOption[];
  stayCheckIn: string;
  stayCheckOut: string;
  stayCutoffMinutes: number | null;
  stayAvailabilityMode: 'open' | 'scheduled';
  stayMaxGuests: string;
  stayMinNights: string;
  stayNightly: string;
  stayCleaningFee: string;
  stayArrivalMethod: '' | 'self' | 'host' | 'lockbox' | 'smart_lock' | 'reception' | 'other';
  stayArrivalNote: string;
  photoSlots: PhotoSlot[];
  photoSlotLabels: string[];
  photoOriginalUrls: string[];
  photoCropSettings: Array<{ crop?: { x?: number; y?: number }; zoom?: number; areaPixels?: { x?: number; y?: number; width?: number; height?: number } | null }>;
  stayPets: string;
  staySmoking: string;
  stayParties: string;
  stayChildren: string;
  stayQuietStart: string;
  stayQuietEnd: string;
  stayHouseRules: string;
  stayExteriorCamera: boolean;
  staySafetyNote: string;
  stayBedrooms: string;
  stayBathrooms: string;
};

type Props = {
  stage: number;
  direction: 'forward' | 'back';
  attempted: boolean;
  blocker: string | null;
  currency: string;
  userId?: string;
  uploadsEnabled: boolean;
  locationConfirmed: boolean;
  onConfirmLocation: (confirmed: boolean) => void;
  selectedPlace: VerifiedDestination | null;
  savedPlaceLabel: string;
  legacyPlaceHint?: string;
  onSelectPlace: (place: VerifiedDestination) => void;
  onClearPlace: () => void;
  values: Values;
  onChange: (patch: Partial<Values>) => void;
  onEditStage: (stage: number) => void;
  returnStage: number | null;
  onReturn: () => void;
  minTitle: number;
  maxTitle: number;
  minDescription: number;
  maxDescription: number;
  maxSubtitle: number;
};

function primaryOption(values: Values): StayAccommodationOption {
  return activeStayOptions(values.stayOptions)[0] ?? emptyStayOption(newStayOptionId(), values.stayPropertyType || 'Apartment');
}

function areasOf(option: StayAccommodationOption): StaySleepingArea[] {
  if (option.sleepingAreas.length > 0) return option.sleepingAreas;
  return [];
}

export default function StayOnboardingFlow(props: Props) {
  const stage = STAY_ONBOARDING_SCREENS[props.stage] ?? STAY_ONBOARDING_SCREENS[0];
  const id = stage.id;
  const wide = id === 'photos' || id === 'room-photos' || id === 'preview';
  const option = primaryOption(props.values);
  const areas = areasOf(option);

  function writeOption(next: StayAccommodationOption) {
    const rest = props.values.stayOptions.filter((row) => row.id !== next.id);
    props.onChange({ stayOptions: [next, ...rest], stayPropertyType: next.propertyType || props.values.stayPropertyType });
  }

  function writeAreas(nextAreas: StaySleepingArea[]) {
    const bedrooms = nextAreas.filter((area) => !/living/i.test(area.name)).length;
    writeOption({
      ...option,
      sleepingAreas: nextAreas,
      bedMix: stayMixFromAreas(nextAreas),
      beds: stayBedCount(stayMixFromAreas(nextAreas)),
      bedrooms,
    });
  }

  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} ${props.direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {stage.group}
            {stage.part && !/of 1$/.test(stage.part) ? ` · ${stage.part}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Step {props.stage + 1} of {STAY_ONBOARDING_SCREENS.length}</p>
        </div>
        {props.returnStage != null && props.stage !== props.returnStage ? (
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={props.onReturn}>Back to preview</button>
        ) : null}
      </div>
      <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{stage.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{stage.body}</p>
      <div className="mt-6">
        {id === 'location' ? <LocationStage {...props} /> : null}
        {id === 'confirm' ? <ConfirmStage {...props} /> : null}
        {id === 'property-type' ? <PropertyTypeStage {...props} option={option} writeOption={writeOption} /> : null}
        {id === 'property-name' ? <PropertyNameStage {...props} /> : null}
        {id === 'amenities' ? (
          <StayAmenityPicker
            selected={stayAmenityDisplayList(props.values.stayAmenities.split(',').map((item) => item.trim()))}
            onChange={(next) => props.onChange({ stayAmenities: next.join(', ') })}
          />
        ) : null}
        {id === 'rooms' ? <RoomsStage areas={areas} onChange={writeAreas} /> : null}
        {id === 'description' ? <DescriptionStage {...props} /> : null}
        {id === 'highlights' ? <HighlightsStage {...props} /> : null}
        {id === 'booking-method' ? <BookingMethodStage /> : null}
        {id === 'booking-times' ? <BookingTimesStage {...props} option={option} /> : null}
        {id === 'booking-cutoff' ? <CutoffStage option={option} writeOption={writeOption} /> : null}
        {id === 'availability' ? <AvailabilityStage {...props} option={option} writeOption={writeOption} /> : null}
        {id === 'guests' ? <GuestsStage {...props} option={option} writeOption={writeOption} /> : null}
        {id === 'stay-length' ? <StayLengthStage {...props} option={option} writeOption={writeOption} /> : null}
        {id === 'price' ? <PricingStage {...props} option={option} writeOption={writeOption} /> : null}
        {id === 'fees' ? <FeesStage {...props} option={option} writeOption={writeOption} /> : null}
        {id === 'arrival-method' ? <ArrivalMethodStage {...props} /> : null}
        {id === 'arrival-notes' ? <ArrivalNotesStage {...props} /> : null}
        {id === 'photos' ? <GalleryStage {...props} /> : null}
        {id === 'room-photos' ? <StayBedroomPhotos options={props.values.stayOptions} galleryUrls={props.values.photoSlots.filter((url) => url.startsWith('http'))} userId={props.userId} uploadsEnabled={props.uploadsEnabled} onChange={(stayOptions) => props.onChange({ stayOptions })} /> : null}
        {id === 'cancellation' ? <CancellationStage /> : null}
        {id === 'house-rules' ? <HouseRulesStage {...props} /> : null}
        {id === 'quiet-hours' ? <QuietHoursStage {...props} /> : null}
        {id === 'safety' ? <SafetyStage {...props} /> : null}
        {id === 'preview' ? <PreviewStage {...props} option={option} /> : null}
        {id === 'publish' ? <PublishStage {...props} option={option} /> : null}
      </div>
      {props.attempted && props.blocker ? (
        <p className="mt-4 text-sm font-medium text-red-700" role="alert">{props.blocker}</p>
      ) : null}
      <div className="mt-8 h-1 overflow-hidden rounded-full bg-[#E6EAF0]" role="progressbar" aria-valuemin={1} aria-valuemax={STAY_ONBOARDING_SCREENS.length} aria-valuenow={props.stage + 1}>
        <div className="h-full bg-[#0B397E] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((props.stage + 1) / STAY_ONBOARDING_SCREENS.length) * 100}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

function LocationStage({ values, onChange, onConfirmLocation, selectedPlace, savedPlaceLabel, legacyPlaceHint, onSelectPlace, onClearPlace }: Props) {
  function writeParts(next: { street?: string; unit?: string; postal?: string; city?: string; notes?: string }) {
    const street = next.street ?? values.stayAddressStreet;
    const unit = next.unit ?? values.stayAddressUnit;
    const postal = next.postal ?? values.stayAddressPostal;
    const city = next.city ?? values.city;
    const notes = next.notes ?? values.stayAddressNotes;
    onChange({
      stayAddressStreet: street,
      stayAddressUnit: unit,
      stayAddressPostal: postal,
      stayAddressNotes: notes,
      city,
      stayCheckInAddress: composeStayCheckInAddress({ street, unit, postal, city, notes }),
    });
    onConfirmLocation(false);
  }
  return (
    <div className="space-y-4">
      <StayAddressSearch
        id="stay-onboarding-address"
        bias={values.destinationLat != null && values.destinationLng != null ? { lat: values.destinationLat, lng: values.destinationLng } : null}
        onUnresolved={() => onConfirmLocation(false)}
        onSelect={(address) => {
          const cityChanged = values.city.trim().toLowerCase() !== address.city.trim().toLowerCase() && Boolean(address.city.trim());
          const street = address.street;
          const unit = address.unit || values.stayAddressUnit;
          const postal = address.postal;
          const city = address.city || values.city;
          const country = address.country || values.country;
          onChange({
            stayAddressStreet: street,
            stayAddressUnit: unit,
            stayAddressPostal: postal,
            city,
            country,
            destinationCountryCode: address.countryCode || values.destinationCountryCode,
            stayCheckInAddress: composeStayCheckInAddress({ street, unit, postal, city, notes: values.stayAddressNotes }),
            stayPinLat: address.lat,
            stayPinLng: address.lng,
            stayPinPlaceId: address.placeId,
            stayPinSource: 'address',
            stayPinAddressKey: stayAddressKey(street, postal, city),
            ...(cityChanged
              ? { destinationPlaceId: '', destinationLat: null, destinationLng: null }
              : {}),
          });
          onConfirmLocation(false);
        }}
      />
      <Field label="Street and building number">
        <input className="tv-input w-full" value={values.stayAddressStreet} maxLength={160} onChange={(e) => writeParts({ street: e.target.value.slice(0, 160) })} />
      </Field>
      <Field label="Apartment or unit, if any">
        <input className="tv-input w-full" value={values.stayAddressUnit} maxLength={40} placeholder="For example 4B" onChange={(e) => writeParts({ unit: e.target.value.slice(0, 40) })} />
      </Field>
      <Field label="Postal code">
        <input className="tv-input w-full" value={values.stayAddressPostal} maxLength={16} onChange={(e) => writeParts({ postal: e.target.value.slice(0, 16) })} />
      </Field>
      <TraverionLocationSelector
        id="stay-onboarding-place"
        label="City"
        placeholder="Search a city or destination"
        selected={selectedPlace}
        savedLabel={savedPlaceLabel}
        legacyHint={legacyPlaceHint}
        onSelect={(place) => {
          onSelectPlace(place);
          onConfirmLocation(false);
        }}
        onClear={onClearPlace}
      />
      <p className="text-xs leading-relaxed text-ink-muted">The street address is saved for booked guests. The public listing shows the city.</p>
    </div>
  );
}

function ConfirmStage({ values, locationConfirmed, onConfirmLocation, onChange }: Props) {
  const address = values.stayCheckInAddress.trim() || composeStayCheckInAddress({
    street: values.stayAddressStreet,
    unit: values.stayAddressUnit,
    postal: values.stayAddressPostal,
    city: values.city,
    notes: values.stayAddressNotes,
  });
  const pinReady = stayPinMatchesAddress({
    source: values.stayPinSource,
    addressKey: values.stayPinAddressKey,
    street: values.stayAddressStreet,
    postal: values.stayAddressPostal,
    city: values.city,
    lat: values.stayPinLat,
    lng: values.stayPinLng,
  });
  const hasPin = values.stayPinLat != null && values.stayPinLng != null;
  const viewLat = hasPin ? values.stayPinLat : values.destinationLat;
  const viewLng = hasPin ? values.stayPinLng : values.destinationLng;
  function placePin(lat: number, lng: number) {
    onChange({
      stayPinLat: lat,
      stayPinLng: lng,
      stayPinSource: 'adjusted',
      stayPinAddressKey: stayAddressKey(values.stayAddressStreet, values.stayAddressPostal, values.city),
    });
    onConfirmLocation(false);
  }
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink">{address || 'Address not added yet'}</p>
      <p className="text-sm text-ink-muted">Public listing: {[values.city, values.country].filter(Boolean).join(', ') || 'City not set'}</p>
      {!pinReady ? (
        <p className="text-sm text-ink-muted">
          {viewLat == null
            ? 'Choose a street address, then place the pin on the property.'
            : hasPin
              ? 'This pin is from the previous address. Drag it onto the property.'
              : 'This map is centered on the city. Tap the property to place the pin.'}
        </p>
      ) : null}
      <StayPin
        resetKey={values.stayPinPlaceId || (hasPin ? 'placed' : 'city')}
        centerLat={viewLat}
        centerLng={viewLng}
        markerLat={hasPin ? values.stayPinLat : null}
        markerLng={hasPin ? values.stayPinLng : null}
        onMove={placePin}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          checked={locationConfirmed && pinReady}
          disabled={!pinReady}
          onChange={(e) => onConfirmLocation(e.target.checked)}
        />
        Is this the correct location?
      </label>
    </div>
  );
}

function StayPin({
  resetKey,
  centerLat,
  centerLng,
  markerLat,
  markerLng,
  onMove,
}: {
  resetKey: string;
  centerLat: number | null;
  centerLng: number | null;
  markerLat: number | null;
  markerLng: number | null;
  onMove: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const viewRef = useRef({ centerLat, centerLng, markerLat, markerLng });
  viewRef.current = { centerLat, centerLng, markerLat, markerLng };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const key = googleMapsBrowserKey();
    const view = viewRef.current;
    if (!key || view.centerLat == null || view.centerLng == null || !ref.current) return;
    let marker: { setMap: (map: null) => void; setPosition: (pos: object) => void; addListener: (name: string, fn: () => void) => void; getPosition: () => { lat: () => number; lng: () => number } | null } | null = null;
    let cancelled = false;
    const scriptId = 'traverion-stay-pin-map';
    const start = () => {
      const maps = window.google?.maps as {
        Map: new (el: HTMLElement, opts: object) => { addListener: (name: string, fn: (event: { latLng?: { lat: () => number; lng: () => number } | null }) => void) => void };
        Marker: new (opts: object) => { setMap: (next: null) => void; setPosition: (pos: object) => void; addListener: (name: string, fn: () => void) => void; getPosition: () => { lat: () => number; lng: () => number } | null };
      } | undefined;
      if (!maps || !ref.current || cancelled) return;
      const zoom = view.markerLat != null ? 17 : 12;
      const map = new maps.Map(ref.current, { center: { lat: view.centerLat, lng: view.centerLng }, zoom, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
      const report = () => {
        const pos = marker?.getPosition();
        if (pos) moveRef.current(pos.lat(), pos.lng());
      };
      if (view.markerLat != null && view.markerLng != null) {
        marker = new maps.Marker({ map, position: { lat: view.markerLat, lng: view.markerLng }, draggable: true });
        marker.addListener('dragend', report);
      }
      map.addListener('click', (event) => {
        const pos = event.latLng;
        if (!pos) return;
        if (!marker) {
          marker = new maps.Marker({ map, position: pos, draggable: true });
          marker.addListener('dragend', report);
        } else marker.setPosition(pos);
        moveRef.current(pos.lat(), pos.lng());
      });
    };
    if (window.google?.maps) start();
    else {
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
        script.onerror = () => setFailed(true);
        document.head.appendChild(script);
      }
      script.addEventListener('load', start);
    }
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [resetKey]);
  if (centerLat == null || centerLng == null) {
    return <p className="text-sm text-ink-muted">Search a street address, or choose the city, before placing the pin.</p>;
  }
  return (
    <div>
      <div ref={ref} className="h-80 w-full overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]" />
      {failed || !googleMapsBrowserKey() ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <p className="col-span-2 text-sm text-ink-muted">The map could not load. Move the pin onto the property.</p>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(centerLat + 0.0004, centerLng)}>North</button>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(centerLat - 0.0004, centerLng)}>South</button>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(centerLat, centerLng - 0.0008)}>West</button>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(centerLat, centerLng + 0.0008)}>East</button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">Drag the pin, or tap the map, to set the property.</p>
      )}
    </div>
  );
}

function PropertyTypeStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const types = stayPropertyTypesForMode('single');
  const selected = option.propertyType || values.stayPropertyType || 'Apartment';
  return (
    <div className="space-y-4">
      {values.stayAccommodationMode === 'multi' ? (
        <p className="rounded-xl bg-[#F4F8FC] px-3 py-3 text-sm text-ink ring-1 ring-[#D5E2F2]">
          Several room types stay saved, and they cannot be booked yet. This listing publishes as one accommodation.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {types.map((type) => {
          const on = selected === type;
          return (
            <button key={type} type="button" aria-pressed={on} className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold ${on ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => writeOption({ ...option, propertyType: type })}>
              {type === 'Room' ? 'Private room' : type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PropertyNameStage({ values, onChange, minTitle, maxTitle, maxSubtitle }: Props) {
  return (
    <div className="space-y-4">
      <Field label="Accommodation name">
        <input className="tv-input w-full" value={values.title} maxLength={maxTitle} onChange={(e) => onChange({ title: e.target.value.slice(0, maxTitle) })} />
      </Field>
      <p className="text-xs text-ink-muted">{values.title.trim().length} / {maxTitle}. At least {minTitle} characters.</p>
      <Field label="Short introduction">
        <input className="tv-input w-full" value={values.subtitle} maxLength={maxSubtitle} onChange={(e) => onChange({ subtitle: e.target.value.slice(0, maxSubtitle) })} />
      </Field>
    </div>
  );
}

function RoomsStage({ areas, onChange }: { areas: StaySleepingArea[]; onChange: (next: StaySleepingArea[]) => void }) {
  function add(living: boolean) {
    onChange([...areas, { id: newStayOptionId(), name: living ? 'Living area' : `Bedroom ${areas.filter((area) => !/living/i.test(area.name)).length + 1}`, beds: [] }]);
  }
  return (
    <div className="space-y-3">
      {areas.map((area) => (
        <section key={area.id} className="stay-stage-forward rounded-xl p-3 ring-1 ring-[#E6EAF0]">
          <div className="flex items-center gap-2">
            <input className="tv-input min-w-0 flex-1" aria-label="Room name" value={area.name} maxLength={40} onChange={(e) => onChange(areas.map((row) => row.id === area.id ? { ...row, name: e.target.value.slice(0, 40) } : row))} />
            <button type="button" className="min-h-11 px-2 text-sm text-ink-muted" onClick={() => onChange(areas.filter((row) => row.id !== area.id))}>Remove</button>
          </div>
          <ul className="mt-2 space-y-2">
            {area.beds.map((bed, index) => {
              const kind = STAY_BED_KINDS.find((row) => row.id === bed.kind);
              const sleeps = (kind?.sleeps ?? 1) * bed.count;
              const noun = `${bed.count} ${(kind?.label ?? 'bed').toLowerCase()}${bed.count === 1 ? '' : 's'}`;
              return (
              <li key={`${area.id}-${index}`} className="space-y-1">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                  <select className="tv-input w-full" value={bed.kind} onChange={(e) => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.map((item, i) => i === index ? { ...item, kind: e.target.value as StayBedKind } : item) } : row))}>
                    {STAY_BED_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <button type="button" className="min-h-11 min-w-11 rounded-lg ring-1 ring-[#E6EAF0]" aria-label="Fewer beds" onClick={() => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.map((item, i) => i === index ? { ...item, count: Math.max(1, item.count - 1) } : item) } : row))}>−</button>
                    <span className="w-6 text-center text-sm tabular-nums">{bed.count}</span>
                    <button type="button" className="min-h-11 min-w-11 rounded-lg ring-1 ring-[#E6EAF0]" aria-label="More beds" onClick={() => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.map((item, i) => i === index ? { ...item, count: Math.min(20, item.count + 1) } : item) } : row))}>+</button>
                  </div>
                  <button type="button" className="min-h-11 text-sm text-ink-muted" onClick={() => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.filter((_, i) => i !== index) } : row))}>Remove</button>
                </div>
                <p className="text-xs text-ink-muted">{noun} · sleeps up to {sleeps}</p>
              </li>
              );
            })}
          </ul>
          <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-finland" onClick={() => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: [...row.beds, { kind: 'double', count: 1 }] } : row))}>Add a bed</button>
        </section>
      ))}
      <div className="flex gap-2">
        <button type="button" className="tv-btn-secondary !min-h-11 flex-1" onClick={() => add(false)}>Add bedroom</button>
        <button type="button" className="tv-btn-secondary !min-h-11 flex-1" onClick={() => add(true)}>Add living area</button>
      </div>
      <p className="text-sm text-ink-muted">These beds sleep up to {staySleepCapacity(stayMixFromAreas(areas))} guests. Living areas are not counted as bedrooms.</p>
    </div>
  );
}

function DescriptionStage({ values, onChange, minDescription, maxDescription }: Props) {
  return (
    <div className="space-y-4">
      <Field label="Description">
        <textarea className="tv-input min-h-56 w-full resize-y" value={values.description} maxLength={maxDescription} onChange={(e) => onChange({ description: e.target.value.slice(0, maxDescription) })} />
      </Field>
      <p className="text-xs text-ink-muted">{values.description.trim().length} / {maxDescription}. At least {minDescription} characters.</p>
    </div>
  );
}

const HIGHLIGHT_CHOICES = [
  'Peaceful surroundings',
  'Private sauna',
  'Central location',
  'Family-friendly',
  'Scenic views',
  'Spacious interiors',
  'Outdoor hot tub',
  'Convenient transport',
];

function HighlightsStage({ values, onChange }: Props) {
  const chosen = values.highlights.map((line) => line.trim()).filter(Boolean);
  function toggle(label: string) {
    const has = chosen.some((line) => line.toLowerCase() === label.toLowerCase());
    const next = has ? chosen.filter((line) => line.toLowerCase() !== label.toLowerCase()) : [...chosen, label].slice(0, 8);
    onChange({ highlights: next });
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {HIGHLIGHT_CHOICES.map((label) => {
          const on = chosen.some((line) => line.toLowerCase() === label.toLowerCase());
          return (
            <button key={label} type="button" aria-pressed={on} className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold ${on ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => toggle(label)}>{label}</button>
          );
        })}
      </div>
      <Field label="Your own highlight">
        <input className="tv-input w-full" maxLength={80} placeholder="Only something this property has" onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const value = e.currentTarget.value.trim().slice(0, 80);
          if (!value || chosen.some((line) => line.toLowerCase() === value.toLowerCase())) return;
          onChange({ highlights: [...chosen, value].slice(0, 8) });
          e.currentTarget.value = '';
        }} />
      </Field>
      <p className="text-xs text-ink-muted">Press Enter to add your own line. Guests only see highlights you confirm.</p>
    </div>
  );
}

function BookingMethodStage() {
  return (
    <div className="rounded-xl bg-[#F4F8FC] p-4 ring-1 ring-[#D5E2F2]">
      <p className="text-sm font-semibold text-ink">Instant booking</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">Guests can confirm an available stay immediately and complete payment securely at checkout.</p>
    </div>
  );
}

function BookingTimesStage({ values, onChange, option }: Props & { option: StayAccommodationOption }) {
  function setClock(key: 'stayCheckIn' | 'stayCheckOut', value: string) {
    const schedules = option.schedules.map((schedule, index) => index === 0 ? { ...schedule, [key === 'stayCheckIn' ? 'checkIn' : 'checkOut']: value } : schedule);
    const rest = values.stayOptions.filter((row) => row.id !== option.id);
    onChange({ [key]: value, stayOptions: [{ ...option, schedules }, ...rest] });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Check-in from">
        <input className="tv-input w-full" type="time" value={values.stayCheckIn} onChange={(e) => setClock('stayCheckIn', e.target.value)} />
      </Field>
      <Field label="Checkout by">
        <input className="tv-input w-full" type="time" value={values.stayCheckOut} onChange={(e) => setClock('stayCheckOut', e.target.value)} />
      </Field>
    </div>
  );
}

function CutoffStage({ option, writeOption }: { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const saved = option.cutoffMinutes ?? 0;
  const known = saved > 0 ? stayCutoffFromMinutes(saved) : null;
  const unit: StayCutoffUnit = known?.unit ?? 'hours';
  const amounts = stayCutoffAmounts(unit);
  function write(nextUnit: StayCutoffUnit, amount: number) {
    writeOption({ ...option, cutoffMinutes: stayCutoffToMinutes(nextUnit, amount) });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Time unit">
          <select className="tv-input w-full" value={unit} onChange={(event) => {
            const nextUnit = event.target.value as StayCutoffUnit;
            write(nextUnit, stayCutoffAmounts(nextUnit)[0]);
          }}>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </Field>
        <Field label="Amount">
          <select className="tv-input w-full" value={known ? String(known.amount) : ''} onChange={(event) => write(unit, Number(event.target.value))}>
            <option value="" disabled>Choose</option>
            {amounts.map((amount) => <option key={amount} value={amount}>{amount}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-sm text-ink-muted">{stayCutoffSummary(saved)}</p>
    </div>
  );
}

function AvailabilityStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const today = localYmd(new Date());
  const season = option.schedules[0];
  const several = option.schedules.length > 1;
  return (
    <div className="space-y-4">
      <button type="button" className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold ${values.stayAvailabilityMode !== 'scheduled' ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => writeOption({ ...option, availabilityMode: 'open' })}>
        Open ongoing
        <span className="mt-1 block font-normal text-ink-muted">Guests can book future nights unless a saved schedule says otherwise.</span>
      </button>
      <button type="button" className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold ${values.stayAvailabilityMode === 'scheduled' ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => {
        if (several) return;
        const start = season?.start || today;
        const end = season?.end || today;
        writeOption({
          ...option,
          availabilityMode: 'scheduled',
          schedules: [{
            id: season?.id || newStayOptionId(),
            name: season?.name || 'Open period',
            start,
            end,
            enabled: true,
            nightlyPrice: option.nightlyPrice,
            minNights: option.minNights,
            checkIn: values.stayCheckIn,
            checkOut: values.stayCheckOut,
            cleaningFee: option.cleaningFee,
            extras: season?.extras,
          }],
        });
      }}>
        A first and last night
        <span className="mt-1 block font-normal text-ink-muted">Nights outside this period cannot be booked.</span>
      </button>
      {several ? <p className="text-sm text-ink-muted">This stay already has more than one schedule. Those seasons stay as they are. Change them after publishing.</p> : null}
      {values.stayAvailabilityMode === 'scheduled' && !several ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TraverionSingleDateField id="stay-open-start" label="First occupied night" value={season?.start ?? ''} minIso={today} onChange={(start) => season && writeOption({ ...option, schedules: [{ ...season, start }] })} />
          <TraverionSingleDateField id="stay-open-end" label="Last occupied night" value={season?.end ?? ''} minIso={season?.start || today} onChange={(end) => season && writeOption({ ...option, schedules: [{ ...season, end }] })} />
        </div>
      ) : null}
      <p className="text-sm text-ink-muted">To close one night, save this draft and use Availability. Closed nights are rejected at checkout. The departure morning is not charged.</p>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 ring-1 ring-[#E6EAF0]">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="min-h-11 min-w-11 rounded-lg ring-1 ring-[#E6EAF0]" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="w-8 text-center text-sm tabular-nums">{value}</span>
        <button type="button" className="min-h-11 min-w-11 rounded-lg ring-1 ring-[#E6EAF0]" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

function GuestsStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const sleeps = staySleepCapacity(option.bedMix);
  const guests = Math.max(1, Number.parseInt(values.stayMaxGuests, 10) || option.maxGuests || 1);
  return (
    <div className="space-y-4">
      <Stepper label="Maximum guests" value={guests} min={1} max={50} onChange={(maxGuests) => writeOption({ ...option, maxGuests })} />
      {sleeps >= 1 ? <p className="text-sm text-ink-muted">The beds sleep up to {sleeps}. A higher guest limit cannot be published.</p> : null}
    </div>
  );
}

function StayLengthStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const minNights = Math.max(1, Number.parseInt(values.stayMinNights, 10) || option.minNights || 1);
  const maxNights = option.schedules[0]?.maxNights ?? null;
  function setMax(next: number | null) {
    const season = option.schedules[0] ?? {
      id: newStayOptionId(),
      name: 'Standard',
      start: '2020-01-01',
      end: '2099-12-31',
      enabled: true,
      nightlyPrice: option.nightlyPrice,
      minNights: option.minNights,
      checkIn: values.stayCheckIn,
      checkOut: values.stayCheckOut,
      cleaningFee: option.cleaningFee,
    };
    writeOption({ ...option, schedules: [{ ...season, maxNights: next }] });
  }
  return (
    <div className="space-y-3">
      <Stepper label="Minimum nights" value={minNights} min={1} max={365} onChange={(nights) => writeOption({ ...option, minNights: nights })} />
      <Stepper label="Maximum nights" value={maxNights ?? minNights} min={minNights} max={365} onChange={(nights) => setMax(nights)} />
      {maxNights != null ? <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => setMax(null)}>No maximum</button> : null}
    </div>
  );
}

function PricingStage({ values, currency, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const nightly = Number.parseFloat(values.stayNightly);
  return (
    <div className="space-y-4">
      <Field label={`Price per night · ${currency}`}>
        <input className="tv-input w-full text-2xl font-semibold" inputMode="decimal" value={values.stayNightly} onChange={(e) => {
          const next = Number(e.target.value);
          writeOption({ ...option, nightlyPrice: Number.isFinite(next) && next > 0 ? Math.round(next * 100) / 100 : null });
        }} />
      </Field>
      {Number.isFinite(nightly) && nightly > 0 ? (
        <p className="text-sm text-ink-muted">Three nights at this rate are {Math.round(nightly * 3 * 100) / 100} {currency} before cleaning or extras. Checkout uses the same nightly rate.</p>
      ) : null}
    </div>
  );
}

function FeesStage({ values, currency, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const extras = option.schedules[0]?.extras ?? [];
  return (
    <div className="space-y-4">
      <Field label={`Cleaning fee · ${currency}, optional`}>
        <input className="tv-input w-full" inputMode="decimal" value={values.stayCleaningFee} onChange={(e) => {
          const cleaning = Number(e.target.value);
          writeOption({ ...option, cleaningFee: Number.isFinite(cleaning) && cleaning >= 0 ? Math.round(cleaning * 100) / 100 : null });
        }} />
      </Field>
      {extras.length > 0 ? (
        <ul className="space-y-1 text-sm text-ink">
          {extras.map((extra) => <li key={extra.id}>{extra.name} · {extra.price} {currency}{extra.requestOnly ? ' · requested, not charged' : ''}</li>)}
        </ul>
      ) : null}
      <p className="text-sm text-ink-muted">Weekly and monthly discounts, extra-guest fees, and optional extras already saved on a schedule are charged by checkout. A first-guest discount is not offered until a booking can redeem it once.</p>
    </div>
  );
}

function ArrivalMethodStage({ values, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {STAY_ARRIVAL_METHODS.map(([id, label]) => {
          const on = values.stayArrivalMethod === id;
          return (
            <button key={id} type="button" aria-pressed={on} className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold ${on ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => onChange({ stayArrivalMethod: id })}>
              {label}
            </button>
          );
        })}
      </div>
      {values.stayArrivalMethod ? <p className="text-sm text-ink-muted">{stayArrivalMethodHint(values.stayArrivalMethod)}</p> : null}
    </div>
  );
}

function ArrivalNotesStage({ values, onChange }: Props) {
  return (
    <div className="space-y-4">
      <Field label="Public arrival note">
        <textarea className="tv-input min-h-20 w-full" maxLength={160} value={values.stayArrivalNote} onChange={(e) => onChange({ stayArrivalNote: e.target.value.slice(0, 160) })} />
      </Field>
      <Field label="Private arrival address">
        <textarea className="tv-input min-h-24 w-full" maxLength={400} value={values.stayCheckInAddress} onChange={(e) => onChange({ stayCheckInAddress: e.target.value.slice(0, 400) })} />
      </Field>
      <p className="text-xs text-ink-muted">Booked guests see the private address after payment. Do not put a door code in the public note.</p>
    </div>
  );
}

function GalleryStage(props: Props) {
  return (
    <ListingImageFields
      photoSlots={props.values.photoSlots}
      photoSlotLabels={props.values.photoSlotLabels}
      photoOriginalUrls={props.values.photoOriginalUrls}
      photoCropSettings={props.values.photoCropSettings}
      userId={props.userId}
      uploadsEnabled={props.uploadsEnabled}
      onPhotosChange={({ slots, labels, originals, crops }) => props.onChange({ photoSlots: slots, photoSlotLabels: labels, photoOriginalUrls: originals, photoCropSettings: crops })}
    />
  );
}

function CancellationStage() {
  return (
    <section className="rounded-xl p-4 ring-1 ring-[#E6EAF0]">
      <p className="text-sm font-semibold text-ink">Traverion standard</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{STAY_GUEST_CANCELLATION_POLICY}</p>
      <p className="mt-3 text-sm text-ink-muted">Full refund when cancelled at least 24 hours before check-in, on the terms of that booking.</p>
    </section>
  );
}

function HouseRulesStage({ values, onChange }: Props) {
  const rules = values.stayHouseRules.toLowerCase();
  const petsConflict = values.stayPets === 'not_allowed' && /pets welcome|pet friendly/.test(rules);
  return (
    <div className="space-y-4">
      <Choice label="Pets" value={values.stayPets} options={[['allowed', 'Allowed'], ['not_allowed', 'Not allowed'], ['approval', 'Ask first']]} onChange={(stayPets) => onChange({ stayPets })} />
      <Choice label="Smoking" value={values.staySmoking} options={[['not_allowed', 'Not allowed'], ['allowed', 'Allowed']]} onChange={(staySmoking) => onChange({ staySmoking })} />
      <Choice label="Parties" value={values.stayParties} options={[['not_allowed', 'Not allowed'], ['allowed', 'Allowed']]} onChange={(stayParties) => onChange({ stayParties })} />
      <Choice label="Children" value={values.stayChildren} options={[['', 'No extra rule'], ['welcome', 'Welcome'], ['not_suitable', 'Not suitable']]} onChange={(stayChildren) => onChange({ stayChildren })} />
      {petsConflict ? <p className="text-sm font-medium text-red-700">The written rules welcome pets, but pets are set to not allowed. Change one of them.</p> : null}
    </div>
  );
}

function QuietHoursStage({ values, onChange }: Props) {
  const mentioned = quietHoursMentioned(values.stayHouseRules);
  const differs = mentioned && (values.stayQuietStart !== mentioned.start || values.stayQuietEnd !== mentioned.end);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quiet hours from"><input className="tv-input w-full" type="time" value={values.stayQuietStart} onChange={(e) => onChange({ stayQuietStart: e.target.value })} /></Field>
        <Field label="Until"><input className="tv-input w-full" type="time" value={values.stayQuietEnd} onChange={(e) => onChange({ stayQuietEnd: e.target.value })} /></Field>
      </div>
      {differs && mentioned ? (
        <button type="button" className="rounded-xl bg-[#F4F8FC] px-3 py-3 text-left text-sm text-ink ring-1 ring-[#D5E2F2]" onClick={() => onChange({ stayQuietStart: mentioned.start, stayQuietEnd: mentioned.end })}>
          Your written rules mention quiet hours from {mentioned.start} to {mentioned.end}. Use these times?
        </button>
      ) : null}
      <Field label="Additional rules">
        <textarea className="tv-input min-h-28 w-full" maxLength={2000} value={values.stayHouseRules} onChange={(e) => onChange({ stayHouseRules: e.target.value.slice(0, 2000) })} />
      </Field>
    </div>
  );
}

function SafetyStage({ values, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <input type="checkbox" checked={values.stayExteriorCamera} onChange={(e) => onChange({ stayExteriorCamera: e.target.checked })} />
        There is an exterior security camera
      </label>
      {values.stayExteriorCamera ? (
        <Field label="Where is the camera?">
          <input className="tv-input w-full" maxLength={160} value={values.staySafetyNote} onChange={(e) => onChange({ staySafetyNote: e.target.value.slice(0, 160) })} />
        </Field>
      ) : (
        <Field label="Other safety note, optional">
          <textarea className="tv-input min-h-20 w-full" maxLength={160} value={values.staySafetyNote} onChange={(e) => onChange({ staySafetyNote: e.target.value.slice(0, 160) })} />
        </Field>
      )}
      <p className="text-xs text-ink-muted">Cameras inside private guest spaces are not allowed. Guests see what you write here before they book.</p>
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <button key={id || text} type="button" aria-pressed={value === id} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${value === id ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

function PreviewStage({ values, currency, onEditStage, option }: Props & { option: StayAccommodationOption }) {
  const propertyType = option.propertyType || values.stayPropertyType || 'Apartment';
  const rows: { label: string; text: string; stage: number }[] = [
    { label: 'Location', text: [values.city, values.country].filter(Boolean).join(', ') || 'Not set', stage: stayScreenIndex('location') },
    { label: 'Property', text: `${propertyType === 'Room' ? 'Private room' : propertyType} · ${values.title || 'Untitled'}`, stage: stayScreenIndex('property-type') },
    { label: 'Sleeping', text: `${values.stayBedrooms || option.bedrooms || 0} bedrooms · sleeps up to ${staySleepCapacity(option.bedMix) || '—'}`, stage: stayScreenIndex('rooms') },
    { label: 'Price', text: values.stayNightly ? `${values.stayNightly} ${currency} per night` : 'Not set', stage: stayScreenIndex('price') },
    { label: 'Arrival', text: stayArrivalMethodLabel(values.stayArrivalMethod) || 'Not set', stage: stayScreenIndex('arrival-method') },
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 ring-1 ring-[#E6EAF0]">
          <div>
            <p className="text-xs text-ink-muted">{row.label}</p>
            <p className="text-sm font-medium text-ink">{row.text}</p>
          </div>
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => onEditStage(row.stage)}>Edit</button>
        </div>
      ))}
      <StayExampleQuote
        currency={currency}
        nightly={Number.parseFloat(values.stayNightly) || 0}
        cleaningFee={Number.parseFloat(values.stayCleaningFee) || 0}
        minNights={Number.parseInt(values.stayMinNights, 10) || 1}
        maxGuests={Number.parseInt(values.stayMaxGuests, 10) || null}
        guestPolicy={option.guestPolicy}
        availabilityMode={values.stayAvailabilityMode}
        seasons={option.schedules}
      />
      <p className="text-xs text-ink-muted">The example uses the same pricing rules as checkout. It is not a booking.</p>
    </div>
  );
}

function PublishStage({ values, onEditStage, option }: Props & { option: StayAccommodationOption }) {
  const propertyType = option.propertyType || values.stayPropertyType;
  const rows: { label: string; ok: boolean; stage: number }[] = [
    { label: 'Location', ok: Boolean(values.city && values.stayAddressStreet), stage: stayScreenIndex('location') },
    { label: 'Property', ok: Boolean(propertyType && values.title.trim().length >= 10), stage: stayScreenIndex('property-name') },
    { label: 'Sleeping', ok: staySleepCapacity(option.bedMix) >= 1, stage: stayScreenIndex('rooms') },
    { label: 'Price', ok: Number.parseFloat(values.stayNightly) > 0, stage: stayScreenIndex('price') },
    { label: 'Photos', ok: values.photoSlots.some((url) => url.startsWith('http')), stage: stayScreenIndex('photos') },
    { label: 'Arrival', ok: Boolean(values.stayArrivalMethod && values.stayCheckInAddress.trim().length >= 8), stage: stayScreenIndex('arrival-notes') },
    { label: 'House rules', ok: Boolean(values.stayPets && values.staySmoking && values.stayParties), stage: stayScreenIndex('house-rules') },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 ring-1 ring-[#E6EAF0]">
          <p className="text-sm text-ink"><span className="font-semibold">{row.ok ? 'Ready' : 'Needs attention'}</span> · {row.label}</p>
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => onEditStage(row.stage)}>Edit</button>
        </li>
      ))}
    </ul>
  );
}

