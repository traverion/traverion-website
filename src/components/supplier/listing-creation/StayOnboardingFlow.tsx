import { useEffect, useRef, useState } from 'react';
import { STAY_ONBOARDING_SCREENS, quietHoursMentioned, stayScreenIndex, stayStageBlocker, type StayOnboardingCheck } from '../../../lib/stay-onboarding';
import { stayAmenityDisplayList } from '../../../lib/stay-amenities';
import { stayPropertyTypesForMode } from '../../../lib/stay-accommodation';
import { STAY_ARRIVAL_METHODS, stayArrivalMethodHint, stayArrivalMethodLabel } from '../../../lib/stay-arrival';
import { STAY_BED_KINDS, stayBedCount, stayBedSummary, stayMixFromAreas, staySleepCapacity, type StayBedKind, type StaySleepingArea } from '../../../lib/stay-beds';
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
import { formatBpsAsPercent, splitGrossByCommissionBps, toMinorUnits } from '../../../lib/commercial-money';
import { formatMoney, normalizeCurrency } from '../../../lib/money';
import { fetchSupplierActiveCommercialTerms } from '../../../data/supabase-earnings';
import { composeStayCheckInAddress, stayAddressKey, stayPinMatchesAddress } from '../../../lib/stay-address';
import StayAddressSearch from './StayAddressSearch';
import { StayChoice, StayField, StayHelp } from './StayCreatorUi';
import { stayArrivalIcon, stayBedIcon, stayHighlightIcon, stayPropertyIcon, staySafetyIcon } from './stay-creator-icons';

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
  publishIssues?: string[];
};

function primaryOption(values: Values): StayAccommodationOption {
  return activeStayOptions(values.stayOptions)[0] ?? emptyStayOption(newStayOptionId(), values.stayPropertyType || 'Apartment');
}

function areasOf(option: StayAccommodationOption): StaySleepingArea[] {
  if (option.sleepingAreas.length > 0) return option.sleepingAreas;
  return [];
}

export default function StayOnboardingFlow(props: Props) {
  const [commissionBps, setCommissionBps] = useState<number | null>(null);
  useEffect(() => {
    if (!props.userId) return;
    let cancelled = false;
    void fetchSupplierActiveCommercialTerms(props.userId)
      .then((row) => {
        if (cancelled) return;
        const bps = row?.commission_bps;
        setCommissionBps(typeof bps === 'number' && Number.isInteger(bps) ? bps : null);
      })
      .catch(() => {
        if (!cancelled) setCommissionBps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.userId]);
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
    <div className={`stay-creator mx-auto w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} ${props.direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="stay-kicker">
            {stage.group}
            {stage.part && !/of 1$/.test(stage.part) ? ` · ${stage.part}` : ''}
          </p>
          <p className="stay-help mt-1">Step {props.stage + 1} of {STAY_ONBOARDING_SCREENS.length}</p>
        </div>
        {props.returnStage != null && props.stage !== props.returnStage ? (
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={props.onReturn}>Back to preview</button>
        ) : null}
      </div>
      <h3 className="stay-title font-display font-semibold">{stage.title}</h3>
      <p className="stay-lede mt-2">{stage.body}</p>
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
        {id === 'price' ? <PricingStage {...props} option={option} writeOption={writeOption} commissionBps={commissionBps} /> : null}
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
        <p className="stay-alert" role="alert">{props.blocker}</p>
      ) : null}
      <div className="mt-8 h-1 overflow-hidden rounded-full bg-[#E6EAF0]" role="progressbar" aria-valuemin={1} aria-valuemax={STAY_ONBOARDING_SCREENS.length} aria-valuenow={props.stage + 1}>
        <div className="h-full bg-[#0B397E] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((props.stage + 1) / STAY_ONBOARDING_SCREENS.length) * 100}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <StayField label={label}>{children}</StayField>;
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Property type">
        {types.map((type) => {
          const on = selected === type;
          const label = type === 'Room' ? 'Private room' : type;
          return (
            <StayChoice key={type} pressed={on} icon={stayPropertyIcon(type)} className="stay-type-card min-h-[5.75rem] flex-col" onClick={() => writeOption({ ...option, propertyType: type })}>
              <span className="mt-2 block">{label}</span>
            </StayChoice>
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

function roomSleepLine(area: StaySleepingArea): string {
  const mix = stayMixFromAreas([area]);
  const summary = stayBedSummary(mix);
  const sleeps = staySleepCapacity(mix);
  if (!summary || sleeps < 1) return 'Add a bed to show who can sleep here.';
  return `${summary.charAt(0).toUpperCase()}${summary.slice(1)} · Sleeps up to ${sleeps}`;
}

function RoomsStage({ areas, onChange }: { areas: StaySleepingArea[]; onChange: (next: StaySleepingArea[]) => void }) {
  function add(living: boolean) {
    onChange([...areas, { id: newStayOptionId(), name: living ? 'Living area' : `Bedroom ${areas.filter((area) => !/living/i.test(area.name)).length + 1}`, beds: [] }]);
  }
  function patch(areaId: string, next: StaySleepingArea) {
    onChange(areas.map((row) => row.id === areaId ? next : row));
  }
  return (
    <div className="space-y-3">
      {areas.map((area) => (
        <section key={area.id} className="stay-panel space-y-3">
          <div className="flex items-center gap-2">
            <input className="tv-input min-w-0 flex-1" aria-label="Room name" value={area.name} maxLength={40} onChange={(e) => patch(area.id, { ...area, name: e.target.value.slice(0, 40) })} />
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-ink-muted" onClick={() => onChange(areas.filter((row) => row.id !== area.id))}>Remove</button>
          </div>
          <p className="text-sm font-medium text-ink">{roomSleepLine(area)}</p>
          <ul className="space-y-2">
            {area.beds.map((bed, index) => (
              <li key={`${area.id}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
                <span className="stay-choice-icon">{stayBedIcon(bed.kind)}</span>
                <select className="tv-input w-full" aria-label={`Bed type in ${area.name || 'room'}`} value={bed.kind} onChange={(e) => patch(area.id, { ...area, beds: area.beds.map((item, i) => i === index ? { ...item, kind: e.target.value as StayBedKind } : item) })}>
                  {STAY_BED_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <button type="button" className="stay-step" aria-label="Fewer beds" disabled={bed.count <= 1} onClick={() => patch(area.id, { ...area, beds: area.beds.map((item, i) => i === index ? { ...item, count: Math.max(1, item.count - 1) } : item) })}>−</button>
                  <span className="w-6 text-center text-sm tabular-nums">{bed.count}</span>
                  <button type="button" className="stay-step" aria-label="More beds" disabled={bed.count >= 20} onClick={() => patch(area.id, { ...area, beds: area.beds.map((item, i) => i === index ? { ...item, count: Math.min(20, item.count + 1) } : item) })}>+</button>
                </div>
                <button type="button" className="min-h-11 text-sm text-ink-muted" onClick={() => patch(area.id, { ...area, beds: area.beds.filter((_, i) => i !== index) })}>Remove</button>
              </li>
            ))}
          </ul>
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => patch(area.id, { ...area, beds: [...area.beds, { kind: 'double', count: 1 }] })}>Add a bed</button>
        </section>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => add(false)}>Add bedroom</button>
        <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => add(true)}>Add living area</button>
      </div>
      <StayHelp>These beds sleep up to {staySleepCapacity(stayMixFromAreas(areas))} guests. Living areas are not counted as bedrooms.</StayHelp>
    </div>
  );
}

function DescriptionStage({ values, onChange, minDescription, maxDescription }: Props) {
  const length = values.description.trim().length;
  const short = length < minDescription;
  return (
    <div className="space-y-3">
      <Field label="Description">
        <textarea className="tv-input min-h-48 w-full resize-y leading-relaxed" value={values.description} maxLength={maxDescription} onChange={(e) => onChange({ description: e.target.value.slice(0, maxDescription) })} />
      </Field>
      <p className={`text-xs ${short ? 'font-semibold text-[#9f1239]' : 'text-ink-muted'}`}>{length} / {maxDescription}. At least {minDescription} characters.</p>
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
  const [draft, setDraft] = useState('');
  const chosen = values.highlights.map((line) => line.trim()).filter(Boolean);
  function toggle(label: string) {
    const has = chosen.some((line) => line.toLowerCase() === label.toLowerCase());
    const next = has ? chosen.filter((line) => line.toLowerCase() !== label.toLowerCase()) : [...chosen, label].slice(0, 8);
    onChange({ highlights: next });
  }
  function addCustom() {
    const value = draft.trim().slice(0, 80);
    if (!value || chosen.some((line) => line.toLowerCase() === value.toLowerCase()) || chosen.length >= 8) return;
    onChange({ highlights: [...chosen, value] });
    setDraft('');
  }
  const custom = chosen.filter((line) => !HIGHLIGHT_CHOICES.some((choice) => choice.toLowerCase() === line.toLowerCase()));
  return (
    <div className="space-y-4">
      {chosen.length > 0 ? (
        <div>
          <p className="stay-kicker">Confirmed</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {chosen.map((line) => (
              <li key={line}>
                <button type="button" className="stay-choice lc-choice lc-choice--selected min-h-11 rounded-full px-3 text-sm font-semibold text-[#073b83]" onClick={() => toggle(line)}>{line}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <StayHelp>Guests only see highlights you confirm.</StayHelp>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {HIGHLIGHT_CHOICES.map((label) => {
          const on = chosen.some((line) => line.toLowerCase() === label.toLowerCase());
          return (
            <StayChoice key={label} pressed={on} icon={stayHighlightIcon(label) ?? undefined} onClick={() => toggle(label)}>{label}</StayChoice>
          );
        })}
      </div>
      {custom.length > 0 ? <StayHelp>Your own lines are in Confirmed. Select one there to remove it.</StayHelp> : null}
      <Field label="Your own highlight">
        <div className="flex gap-2">
          <input className="tv-input min-w-0 flex-1" maxLength={80} value={draft} placeholder="Only something this property has" onChange={(e) => setDraft(e.target.value.slice(0, 80))} onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addCustom();
          }} />
          <button type="button" className="tv-btn-secondary !min-h-11 shrink-0" onClick={addCustom} disabled={!draft.trim() || chosen.length >= 8}>Add</button>
        </div>
      </Field>
    </div>
  );
}

function BookingMethodStage() {
  return (
    <div className="stay-panel">
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
  const presetAmounts = stayCutoffAmounts(unit);
  const amounts = known && !presetAmounts.includes(known.amount)
    ? [...presetAmounts, known.amount].sort((left, right) => left - right)
    : presetAmounts;
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
      <StayHelp>{stayCutoffSummary(saved)}</StayHelp>
    </div>
  );
}

function AvailabilityStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const today = localYmd(new Date());
  const season = option.schedules[0];
  const several = option.schedules.length > 1;
  return (
    <div className="space-y-4">
      <StayChoice pressed={values.stayAvailabilityMode !== 'scheduled'} onClick={() => writeOption({ ...option, availabilityMode: 'open' })} className="flex-col">
        Open ongoing
        <span className="stay-help mt-1 block font-normal">Guests can book future nights unless a saved schedule says otherwise.</span>
      </StayChoice>
      <StayChoice pressed={values.stayAvailabilityMode === 'scheduled'} className="flex-col" onClick={() => {
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
        <span className="stay-help mt-1 block font-normal">Nights outside this period cannot be booked.</span>
      </StayChoice>
      {several ? <p className="text-sm text-ink-muted">This stay already has more than one schedule. Those seasons stay as they are. Change them after publishing.</p> : null}
      {values.stayAvailabilityMode === 'scheduled' && !several ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TraverionSingleDateField id="stay-open-start" label="First occupied night" value={season?.start ?? ''} minIso={today} onChange={(start) => season && writeOption({ ...option, schedules: [{ ...season, start }] })} />
          <TraverionSingleDateField id="stay-open-end" label="Last occupied night" value={season?.end ?? ''} minIso={season?.start || today} onChange={(end) => season && writeOption({ ...option, schedules: [{ ...season, end }] })} />
        </div>
      ) : null}
      <StayHelp>To close one night, save this draft and use Availability. Closed nights are rejected at checkout. The departure morning is not charged.</StayHelp>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (next: number) => void }) {
  return (
    <div className="stay-panel flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="stay-step" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="w-8 text-center text-sm tabular-nums">{value}</span>
        <button type="button" className="stay-step" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
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
      {sleeps >= 1 ? <StayHelp>The beds sleep up to {sleeps}. A higher guest limit cannot be published.</StayHelp> : null}
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

function exactMoney(amount: number, currency: string): string {
  const code = normalizeCurrency(currency);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function PricingStage({ values, currency, option, writeOption, commissionBps }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void; commissionBps: number | null }) {
  const nightly = Number.parseFloat(values.stayNightly);
  const priced = Number.isFinite(nightly) && nightly > 0;
  let split: ReturnType<typeof splitGrossByCommissionBps> | null = null;
  if (priced && commissionBps != null) {
    try {
      split = splitGrossByCommissionBps(toMinorUnits(nightly), commissionBps);
    } catch {
      split = null;
    }
  }
  return (
    <div className="space-y-4">
      <Field label={`Price per night · ${currency}`}>
        <input className="tv-input w-full text-2xl font-semibold" inputMode="decimal" value={values.stayNightly} onChange={(e) => {
          const next = Number(e.target.value);
          writeOption({ ...option, nightlyPrice: Number.isFinite(next) && next > 0 ? Math.round(next * 100) / 100 : null });
        }} />
      </Field>
      {priced && split ? (
        <dl className="stay-panel space-y-2 text-sm text-ink">
          <div className="flex justify-between gap-3"><dt>Guest pays</dt><dd className="tabular-nums">{exactMoney(nightly, currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Traverion commission ({formatBpsAsPercent(split.commissionBps)})</dt><dd className="tabular-nums">{exactMoney(split.commissionMinor / 100, currency)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-[#E6EAF0] pt-2 font-semibold"><dt>Supplier receives</dt><dd className="tabular-nums">{exactMoney(split.supplierMinor / 100, currency)}</dd></div>
          <p className="stay-help">One night only. Cleaning and extras are charged separately.</p>
        </dl>
      ) : priced ? (
        <StayHelp>Supplier earnings appear when your active agreement is available. This example is one night. Cleaning and extras are charged separately.</StayHelp>
      ) : null}
    </div>
  );
}

const EXTRA_CHARGE_LABEL: Record<string, string> = {
  per_stay: 'per stay',
  per_night: 'per night',
  per_guest: 'per guest',
  per_guest_night: 'per guest, per night',
};

function FeesStage({ values, currency, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const extras = option.schedules[0]?.extras ?? [];
  return (
    <div className="space-y-4">
      <Field label={`Cleaning fee · ${currency}, per stay`}>
        <input className="tv-input w-full" inputMode="decimal" value={values.stayCleaningFee} onChange={(e) => {
          const cleaning = Number(e.target.value);
          writeOption({ ...option, cleaningFee: Number.isFinite(cleaning) && cleaning >= 0 ? Math.round(cleaning * 100) / 100 : null });
        }} />
      </Field>
      <StayHelp>A cleaning amount is charged once per stay. It is not optional for the guest. Leave it blank when there is no cleaning fee.</StayHelp>
      {extras.length > 0 ? (
        <ul className="stay-panel space-y-2 text-sm text-ink">
          {extras.map((extra) => (
            <li key={extra.id} className="flex items-start justify-between gap-3">
              <span>{extra.name}</span>
              <span className="text-right text-ink-muted">
                {extra.price} {currency}
                {EXTRA_CHARGE_LABEL[extra.charge] ? ` · ${EXTRA_CHARGE_LABEL[extra.charge]}` : ''}
                {extra.mandatory ? ' · mandatory' : extra.requestOnly ? ' · requested, not charged' : ' · optional'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <StayHelp>Weekly and monthly discounts and extra-guest fees already saved on a schedule apply to the lodging price at checkout.</StayHelp>
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
            <StayChoice key={id} pressed={on} icon={stayArrivalIcon(id)} onClick={() => onChange({ stayArrivalMethod: id })}>
              {label}
            </StayChoice>
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
      <div className="stay-panel space-y-2">
        <Field label="Public arrival note">
          <textarea className="tv-input min-h-20 w-full" maxLength={160} value={values.stayArrivalNote} onChange={(e) => onChange({ stayArrivalNote: e.target.value.slice(0, 160) })} />
        </Field>
        <StayHelp>Guests can read this before they book. Do not include a door code or the street address.</StayHelp>
      </div>
      <div className="stay-panel space-y-2">
        <Field label="Private arrival address">
          <textarea className="tv-input min-h-24 w-full" maxLength={400} value={values.stayCheckInAddress} onChange={(e) => onChange({ stayCheckInAddress: e.target.value.slice(0, 400) })} />
        </Field>
        <StayHelp>Booked guests see this after payment. Codes belong here, not in the public note.</StayHelp>
      </div>
    </div>
  );
}

function GalleryStage(props: Props) {
  return (
    <ListingImageFields
      presentation="stay"
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
        <button type="button" className="stay-panel w-full text-left" onClick={() => onChange({ stayQuietStart: mentioned.start, stayQuietEnd: mentioned.end })}>
          <span className="block text-sm font-semibold text-ink">Use {mentioned.start}–{mentioned.end}</span>
          <span className="stay-help mt-1 block">Your written rules mention these quiet hours. This fills the times above and leaves the written rules unchanged.</span>
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
      <label className="stay-panel flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <span className="stay-choice-icon">{staySafetyIcon()}</span>
        <input type="checkbox" className="h-4 w-4" checked={values.stayExteriorCamera} onChange={(e) => onChange({ stayExteriorCamera: e.target.checked })} />
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
      <StayHelp>Cameras inside private guest spaces are not allowed. Guests see this disclosure before they book. An empty note does not mean the property has no hazards.</StayHelp>
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="stay-kicker">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <button key={id || text} type="button" aria-pressed={value === id} className={`stay-choice lc-choice min-h-11 rounded-full px-3 text-sm font-semibold ${value === id ? 'lc-choice--selected text-[#073b83]' : ''}`} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

function PreviewEdit({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="min-h-11 shrink-0 text-sm font-semibold text-finland" onClick={onClick}>{label}</button>;
}

function PreviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#E6EAF0] pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h5 className="font-display text-lg font-semibold text-ink">{title}</h5>
        <PreviewEdit label="Edit" onClick={onEdit} />
      </div>
      {children}
    </section>
  );
}

function readableRule(value: string): string {
  if (value === 'not_allowed') return 'Not allowed';
  if (value === 'allowed') return 'Allowed';
  if (value === 'approval') return 'Ask first';
  if (value === 'welcome') return 'Welcome';
  if (value === 'not_suitable') return 'Not suitable';
  return value;
}

function PreviewStage({ values, currency, onEditStage, option }: Props & { option: StayAccommodationOption }) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const propertyType = option.propertyType || values.stayPropertyType || 'Stay';
  const photos = values.photoSlots.filter((url) => url.startsWith('http'));
  const cover = photos[0];
  const amenities = stayAmenityDisplayList(values.stayAmenities.split(',').map((item) => item.trim()));
  const highlights = values.highlights.map((line) => line.trim()).filter(Boolean);
  const nightly = Number.parseFloat(values.stayNightly);
  const sleeps = staySleepCapacity(option.bedMix);
  const beds = stayBedSummary(option.bedMix);
  const guests = Number.parseInt(values.stayMaxGuests, 10);
  const rules = [
    values.stayPets ? `Pets · ${readableRule(values.stayPets)}` : '',
    values.staySmoking ? `Smoking · ${readableRule(values.staySmoking)}` : '',
    values.stayParties ? `Parties · ${readableRule(values.stayParties)}` : '',
    values.stayChildren ? `Children · ${readableRule(values.stayChildren)}` : '',
    values.stayQuietStart && values.stayQuietEnd ? `Quiet hours ${values.stayQuietStart}–${values.stayQuietEnd}` : '',
    values.stayHouseRules.trim(),
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Preview size">
        {(['desktop', 'mobile'] as const).map((size) => (
          <button key={size} type="button" aria-pressed={viewport === size} className={`stay-choice lc-choice min-h-11 rounded-full px-3 text-sm font-semibold capitalize ${viewport === size ? 'lc-choice--selected text-[#073b83]' : ''}`} onClick={() => setViewport(size)}>{size}</button>
        ))}
      </div>
      <article className={`overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0] ${viewport === 'mobile' ? 'mx-auto max-w-sm' : ''}`}>
        {cover ? <img src={cover} alt="" className="aspect-[16/10] w-full object-cover" /> : <div className="flex aspect-[16/10] items-center justify-center bg-[#F4F6F8] text-sm text-ink-muted">Add a cover photo</div>}
        {photos.length > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto px-4 pt-3">
            {photos.slice(0, 6).map((url, index) => <img key={url} src={url} alt="" className={`h-14 w-20 shrink-0 rounded-md object-cover ${index === 0 ? 'ring-2 ring-[#073b83]' : ''}`} />)}
          </div>
        ) : null}
        <div className="space-y-4 p-4 sm:p-5">
          <header>
            <p className="stay-kicker">{propertyType === 'Room' ? 'Private room' : propertyType}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h4 className="font-display text-2xl font-semibold tracking-tight text-ink">{values.title || 'Untitled stay'}</h4>
              <PreviewEdit label="Edit" onClick={() => onEditStage(stayScreenIndex('property-name'))} />
            </div>
            <p className="text-sm text-ink-muted">{[values.city, values.country].filter(Boolean).join(', ') || 'Location not set'}</p>
            {Number.isFinite(nightly) && nightly > 0 ? <p className="mt-3 text-lg font-semibold tabular-nums text-ink">{formatMoney(nightly, currency)} <span className="text-sm font-medium text-ink-muted">per night</span></p> : null}
          </header>
          <dl className="grid grid-cols-3 gap-2 border-t border-[#E6EAF0] pt-4 text-sm">
            <div><dt className="stay-kicker">Guests</dt><dd className="mt-1 font-semibold text-ink">{Number.isFinite(guests) && guests > 0 ? guests : '—'}</dd></div>
            <div><dt className="stay-kicker">Bedrooms</dt><dd className="mt-1 font-semibold text-ink">{values.stayBedrooms || option.bedrooms || 0}</dd></div>
            <div><dt className="stay-kicker">Sleeps</dt><dd className="mt-1 font-semibold text-ink">{sleeps > 0 ? sleeps : '—'}</dd></div>
          </dl>
          {beds ? <p className="text-sm text-ink">{beds.charAt(0).toUpperCase()}{beds.slice(1)}</p> : null}
          <div className="flex justify-end"><PreviewEdit label="Edit sleeping" onClick={() => onEditStage(stayScreenIndex('rooms'))} /></div>
          {values.description.trim() ? (
            <PreviewSection title="The place" onEdit={() => onEditStage(stayScreenIndex('description'))}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{values.description}</p>
            </PreviewSection>
          ) : null}
          {highlights.length > 0 ? (
            <PreviewSection title="Highlights" onEdit={() => onEditStage(stayScreenIndex('highlights'))}>
              <ul className="flex flex-wrap gap-2">{highlights.map((line) => <li key={line} className="rounded-full bg-[#F4F6F8] px-3 py-1 text-sm text-ink">{line}</li>)}</ul>
            </PreviewSection>
          ) : null}
          {amenities.length > 0 ? (
            <PreviewSection title="Amenities" onEdit={() => onEditStage(stayScreenIndex('amenities'))}>
              <ul className="flex flex-wrap gap-2">{amenities.map((item) => <li key={item} className="rounded-full bg-[#F4F6F8] px-3 py-1 text-sm text-ink">{item === 'Wifi' ? 'Wi-Fi' : item}</li>)}</ul>
            </PreviewSection>
          ) : null}
          <PreviewSection title="Arrival" onEdit={() => onEditStage(stayScreenIndex('arrival-method'))}>
            <p className="text-sm text-ink">{stayArrivalMethodLabel(values.stayArrivalMethod) || 'Arrival method not set'}</p>
            {values.stayArrivalNote.trim() ? <p className="mt-1 text-sm text-ink-muted">{values.stayArrivalNote.trim()}</p> : null}
          </PreviewSection>
          {rules.length > 0 ? (
            <PreviewSection title="House rules" onEdit={() => onEditStage(stayScreenIndex('house-rules'))}>
              <ul className="space-y-1 text-sm text-ink">{rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
            </PreviewSection>
          ) : null}
          {values.stayExteriorCamera || values.staySafetyNote.trim() ? (
            <PreviewSection title="Safety" onEdit={() => onEditStage(stayScreenIndex('safety'))}>
              <p className="text-sm text-ink">{values.stayExteriorCamera ? `Exterior security camera${values.staySafetyNote.trim() ? `: ${values.staySafetyNote.trim()}` : ''}` : values.staySafetyNote.trim()}</p>
            </PreviewSection>
          ) : null}
        </div>
      </article>
      <details className="rounded-xl ring-1 ring-[#E6EAF0]">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-ink">Example quote</summary>
        <div className="px-3 pb-3">
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
          <p className="mt-2 text-xs text-ink-muted">The example uses the same pricing rules as checkout. It does not create a reservation. The street address stays private.</p>
        </div>
      </details>
    </div>
  );
}

function PublishStage({ values, onEditStage, option, locationConfirmed, minTitle, minDescription, publishIssues = [] }: Props & { option: StayAccommodationOption }) {
  const cover = values.photoSlots.find((url) => url.startsWith('http'));
  const areasWithBeds = option.sleepingAreas.filter((area) => area.beds.some((bed) => bed.count > 0)).length;
  const check: StayOnboardingCheck = {
    city: values.city,
    country: values.country,
    hasPlace: Boolean(values.destinationPlaceId || (values.city && values.country)),
    street: values.stayAddressStreet,
    postal: values.stayAddressPostal,
    locationConfirmed,
    pinReady: stayPinMatchesAddress({
      source: values.stayPinSource,
      addressKey: values.stayPinAddressKey,
      street: values.stayAddressStreet,
      postal: values.stayAddressPostal,
      city: values.city,
      lat: values.stayPinLat,
      lng: values.stayPinLng,
    }),
    title: values.title,
    propertyType: option.propertyType || values.stayPropertyType,
    areasWithBeds,
    maxGuests: Number.parseInt(values.stayMaxGuests, 10) || null,
    minNights: Number.parseInt(values.stayMinNights, 10) || null,
    maxNights: option.schedules[0]?.maxNights ?? null,
    sleepCapacity: staySleepCapacity(option.bedMix),
    nightly: Number.parseFloat(values.stayNightly) || null,
    checkIn: values.stayCheckIn,
    checkOut: values.stayCheckOut,
    arrivalMethod: values.stayArrivalMethod,
    photoCount: values.photoSlots.filter((url) => url.startsWith('http')).length,
    address: values.stayCheckInAddress,
    rulesChosen: Boolean(values.stayPets && values.staySmoking && values.stayParties),
    descriptionLength: values.description.trim().length,
    minDescription,
    minTitle,
    exteriorCamera: values.stayExteriorCamera,
    safetyNote: values.staySafetyNote,
  };
  const rows: { id: string; label: string }[] = [
    { id: 'location', label: 'Location' },
    { id: 'confirm', label: 'Map pin' },
    { id: 'property-name', label: 'Name' },
    { id: 'description', label: 'Description' },
    { id: 'rooms', label: 'Sleeping' },
    { id: 'guests', label: 'Guests' },
    { id: 'booking-times', label: 'Check-in times' },
    { id: 'price', label: 'Nightly price' },
    { id: 'photos', label: 'Photos' },
    { id: 'arrival-notes', label: 'Arrival' },
    { id: 'house-rules', label: 'House rules' },
    { id: 'safety', label: 'Safety' },
  ];
  const issues = rows.map((row) => ({ ...row, issue: stayStageBlocker(row.id, check) }));
  const open = issues.filter((row) => row.issue);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {cover ? <img src={cover} alt="" className="h-16 w-24 rounded-lg object-cover" /> : <div className="h-16 w-24 rounded-lg bg-[#F4F6F8]" />}
        <div>
          <p className="font-semibold text-ink">{values.title || 'Untitled stay'}</p>
          <p className="text-sm text-ink-muted">{[values.city, values.country].filter(Boolean).join(', ') || 'Location not set'}</p>
        </div>
      </div>
      <p className="text-sm text-ink-muted">{open.length === 0 && publishIssues.length === 0 ? 'The stay checks on this screen passed. Publishing happens only when you use the button below.' : `${open.length + publishIssues.length} item${open.length + publishIssues.length === 1 ? '' : 's'} still need attention.`}</p>
      <ul className="space-y-2">
        {issues.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 ring-1 ring-[#E6EAF0]">
            <p className="text-sm text-ink"><span className="font-semibold">{row.issue ? 'Needs attention' : 'Ready'}</span> · {row.label}{row.issue ? ` — ${row.issue}` : ''}</p>
            <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => onEditStage(stayScreenIndex(row.id))}>Edit</button>
          </li>
        ))}
      </ul>
      {publishIssues.length > 0 ? (
        <ul className="space-y-1 text-sm text-ink">
          {publishIssues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
      <p className="text-sm text-ink-muted">After publication the listing can appear in search. Guests still see only the city until a booking is paid. A live listing uses Save changes instead of publishing again.</p>
    </div>
  );
}

