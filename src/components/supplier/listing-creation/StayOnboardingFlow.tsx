import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STAY_ONBOARDING_SCREENS, clampStayIntroInput, quietHoursMentioned, stayScreenIndex, stayStageBlocker, type StayOnboardingCheck } from '../../../lib/stay-onboarding';
import { STAY_SAFETY_CONSIDERATIONS, staySafetyConsiderationLines } from '../../../lib/stay-safety';
import { clampListingDescriptionInput, clampListingTitleInput } from '../../../lib/listingQualityScore';
import { stayAmenityDisplayList } from '../../../lib/stay-amenities';
import { stayHighlightAmenityHints, staySelfCheckInConflict, stayTurnoverAdvisory } from '../../../lib/stay-creator-consistency';
import { isStandardStayPropertyType, stayPropertyTypesForMode } from '../../../lib/stay-accommodation';
import { STAY_ARRIVAL_METHODS, stayArrivalMethodHint, stayArrivalMethodLabel } from '../../../lib/stay-arrival';
import { STAY_BED_KINDS, stayBedCount, stayBedSummary, stayMixFromAreas, staySleepCapacity, type StayBedKind, type StaySleepingArea } from '../../../lib/stay-beds';
import { activeStayOptions, emptyStayOption, newStayOptionId, type StayAccommodationOption } from '../../../lib/stay-options';
import { STAY_GUEST_CANCELLATION_POLICY } from '../../../types/listingExtras';
import { googleMapsBrowserKey } from '../../../lib/places-client';
import type { VerifiedDestination } from '../../../lib/destination-place';
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
import type { StaySeasonExtra } from '../../../lib/stay-season-quote';
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
  stayCameraLocation: string;
  staySafetyConsiderations: string[];
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
  const previewWide = id === 'preview' || id === 'publish';
  const mapWide = id === 'confirm';
  const wide = id === 'photos' || id === 'room-photos' || previewWide;
  const option = primaryOption(props.values);
  const areas = areasOf(option);

  function writeOption(next: StayAccommodationOption) {
    const rest = props.values.stayOptions.filter((row) => row.id !== next.id);
    props.onChange({ stayOptions: [next, ...rest], stayPropertyType: next.propertyType || props.values.stayPropertyType });
  }

  function writeAreas(nextAreas: StaySleepingArea[]) {
    const bedrooms = nextAreas.filter((area) => !/living/i.test(area.name)).length;
    const bedMix = stayMixFromAreas(nextAreas);
    const sleeps = staySleepCapacity(bedMix);
    const maxGuests =
      option.maxGuests != null && sleeps >= 1 ? Math.min(option.maxGuests, sleeps) : option.maxGuests;
    writeOption({
      ...option,
      sleepingAreas: nextAreas,
      bedMix,
      beds: stayBedCount(bedMix),
      bedrooms,
      maxGuests: maxGuests ?? null,
    });
  }

  return (
    <div className={`stay-creator mx-auto w-full ${previewWide ? 'max-w-[76rem]' : mapWide ? 'max-w-2xl' : wide ? 'max-w-3xl' : 'max-w-xl'} ${props.direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward'}`}>
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
        {id === 'property-intro' ? <PropertyIntroStage {...props} /> : null}
        {id === 'amenities' ? <AmenitiesStage {...props} /> : null}
        {id === 'rooms' ? <RoomsStage areas={areas} maxGuests={props.values.stayMaxGuests} onChange={writeAreas} /> : null}
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
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <StayField label={label}>{children}</StayField>;
}

function selectedAddressLabel(values: Values): string {
  return [values.stayAddressStreet, [values.stayAddressPostal, values.city].filter(Boolean).join(' '), values.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function LocationStage({ values, onChange, onConfirmLocation }: Props) {
  function writeUnit(unit: string) {
    const street = values.stayAddressStreet;
    const postal = values.stayAddressPostal;
    const city = values.city;
    onChange({
      stayAddressUnit: unit,
      stayCheckInAddress: composeStayCheckInAddress({ street, unit, postal, city, notes: values.stayAddressNotes }),
    });
  }
  return (
    <div className="space-y-4">
      <StayAddressSearch
        id="stay-onboarding-address"
        bias={values.stayPinLat != null && values.stayPinLng != null ? { lat: values.stayPinLat, lng: values.stayPinLng } : values.destinationLat != null && values.destinationLng != null ? { lat: values.destinationLat, lng: values.destinationLng } : null}
        selectedLabel={selectedAddressLabel(values)}
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
      <Field label="Apartment / Unit (optional)">
        <input className="tv-input w-full" value={values.stayAddressUnit} maxLength={40} placeholder="D7 or 4B" aria-label="Apartment or unit" onChange={(e) => writeUnit(e.target.value.slice(0, 40))} />
      </Field>
      <StayHelp>Apartment or unit stays private with the street address.</StayHelp>
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
        resetKey={`${values.stayPinPlaceId || values.stayPinAddressKey || 'none'}|${hasPin ? 'pin' : 'city'}`}
        centerLat={viewLat}
        centerLng={viewLng}
        markerLat={hasPin ? values.stayPinLat : null}
        markerLng={hasPin ? values.stayPinLng : null}
        onMove={placePin}
      />
      <label className="stay-panel flex min-h-12 cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0"
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
    let map: { setZoom: (zoom: number) => void; panTo: (pos: object) => void; addListener: (name: string, fn: (event: { latLng?: { lat: () => number; lng: () => number } | null }) => void) => void } | null = null;
    let cancelled = false;
    const scriptId = 'traverion-stay-pin-map';
    const start = () => {
      const maps = window.google?.maps as {
        Map: new (el: HTMLElement, opts: object) => {
          setZoom: (zoom: number) => void;
          panTo: (pos: object) => void;
          addListener: (name: string, fn: (event: { latLng?: { lat: () => number; lng: () => number } | null }) => void) => void;
        };
        Marker: new (opts: object) => { setMap: (next: null) => void; setPosition: (pos: object) => void; addListener: (name: string, fn: () => void) => void; getPosition: () => { lat: () => number; lng: () => number } | null };
      } | undefined;
      if (!maps || !ref.current || cancelled) return;
      const zoom = view.markerLat != null ? 17 : 13;
      map = new maps.Map(ref.current, { center: { lat: view.centerLat, lng: view.centerLng }, zoom, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
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
        const firstPin = !marker;
        if (!marker) {
          marker = new maps.Marker({ map, position: pos, draggable: true });
          marker.addListener('dragend', report);
        } else marker.setPosition(pos);
        if (firstPin) {
          map?.setZoom(17);
          map?.panTo(pos);
        }
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
    return <p className="text-sm text-ink-muted">Choose a street address before placing the pin.</p>;
  }
  return (
    <div>
      <div ref={ref} className="h-[22rem] w-full overflow-hidden rounded-xl ring-1 ring-[#E6EAF0] sm:h-96" />
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
  const stored = (option.propertyType || values.stayPropertyType).trim();
  const standard = isStandardStayPropertyType(stored);
  const otherSelected = !standard && stored.length > 0;
  const custom = standard || stored === 'Other' ? '' : stored;
  const customRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4">
      {values.stayAccommodationMode === 'multi' ? (
        <p className="rounded-xl bg-[#F4F8FC] px-3 py-3 text-sm text-ink ring-1 ring-[#D5E2F2]">
          Several room types stay saved, and they cannot be booked yet. This listing publishes as one accommodation.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Property type">
        {types.map((type) => {
          const on = type === 'Other' ? otherSelected : stored === type;
          const label = type === 'Room' ? 'Private room' : type;
          return (
            <StayChoice
              key={type}
              pressed={on}
              icon={stayPropertyIcon(type)}
              className="stay-type-card min-h-[5.75rem] flex-col"
              onClick={() => {
                if (type === 'Other') {
                  if (otherSelected) {
                    customRef.current?.focus();
                    return;
                  }
                  writeOption({ ...option, propertyType: 'Other' });
                  window.setTimeout(() => customRef.current?.focus(), 0);
                  return;
                }
                writeOption({ ...option, propertyType: type });
              }}
            >
              <span className="mt-2 block">{label}</span>
            </StayChoice>
          );
        })}
      </div>
      {otherSelected ? (
        <Field label="Specify your property type">
          <input
            ref={customRef}
            className="tv-input w-full"
            value={custom}
            maxLength={40}
            placeholder="e.g. Glass igloo, treehouse, houseboat"
            aria-label="Specify your property type"
            onChange={(e) => {
              const next = e.target.value.slice(0, 40);
              writeOption({ ...option, propertyType: next.trim() ? next : 'Other' });
            }}
          />
        </Field>
      ) : null}
    </div>
  );
}

function PropertyNameStage({ values, onChange, minTitle, maxTitle }: Props) {
  return (
    <div className="space-y-2">
      <Field label="Accommodation name">
        <input
          className="tv-input w-full"
          value={values.title}
          aria-label="Accommodation name"
          onChange={(e) => onChange({ title: clampListingTitleInput(e.target.value, values.title) })}
        />
      </Field>
      <p className="text-xs tabular-nums text-ink-muted">{values.title.trim().length} / {maxTitle}. At least {minTitle} characters.</p>
    </div>
  );
}

function PropertyIntroStage({ values, onChange, maxSubtitle }: Props) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = '160px';
    field.style.height = `${Math.max(160, field.scrollHeight)}px`;
  }, [values.subtitle]);
  return (
    <div className="space-y-2">
      <Field label="Short introduction">
        <textarea
          ref={fieldRef}
          className="tv-input stay-intro-input w-full resize-y py-2"
          value={values.subtitle}
          maxLength={maxSubtitle}
          aria-label="Short introduction"
          onChange={(e) => onChange({ subtitle: clampStayIntroInput(e.target.value, values.subtitle, maxSubtitle) })}
        />
      </Field>
      <StayHelp>This appears under the property name. Maximum {maxSubtitle} characters.</StayHelp>
      <p className="text-xs tabular-nums text-ink-muted">{values.subtitle.trim().length} / {maxSubtitle}</p>
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

function AmenitiesStage({ values, onChange }: Props) {
  const selected = stayAmenityDisplayList(values.stayAmenities.split(',').map((item) => item.trim()));
  const conflict = staySelfCheckInConflict(selected, values.stayArrivalMethod);
  return (
    <div className="space-y-4">
      <StayAmenityPicker selected={selected} onChange={(next) => onChange({ stayAmenities: next.join(', ') })} />
      {conflict ? (
        <p className="text-sm font-medium text-[#9a6700]" role="status">
          {conflict}
        </p>
      ) : null}
    </div>
  );
}

function RoomsStage({
  areas,
  maxGuests,
  onChange,
}: {
  areas: StaySleepingArea[];
  maxGuests: string;
  onChange: (next: StaySleepingArea[]) => void;
}) {
  const sleeps = staySleepCapacity(stayMixFromAreas(areas));
  const guests = Number.parseInt(maxGuests, 10);
  function add(living: boolean) {
    onChange([...areas, { id: newStayOptionId(), name: living ? 'Living area' : `Bedroom ${areas.filter((area) => !/living/i.test(area.name)).length + 1}`, beds: [] }]);
  }
  function patch(areaId: string, next: StaySleepingArea) {
    onChange(areas.map((row) => (row.id === areaId ? next : row)));
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
                <select className="tv-input w-full" aria-label={`Bed type in ${area.name || 'room'}`} value={bed.kind} onChange={(e) => patch(area.id, { ...area, beds: area.beds.map((item, i) => (i === index ? { ...item, kind: e.target.value as StayBedKind } : item)) })}>
                  {STAY_BED_KINDS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button type="button" className="stay-step" aria-label="Fewer beds" disabled={bed.count <= 1} onClick={() => patch(area.id, { ...area, beds: area.beds.map((item, i) => (i === index ? { ...item, count: Math.max(1, item.count - 1) } : item)) })}>
                    −
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{bed.count}</span>
                  <button type="button" className="stay-step" aria-label="More beds" disabled={bed.count >= 20} onClick={() => patch(area.id, { ...area, beds: area.beds.map((item, i) => (i === index ? { ...item, count: Math.min(20, item.count + 1) } : item)) })}>
                    +
                  </button>
                </div>
                <button type="button" className="min-h-11 text-sm text-ink-muted" onClick={() => patch(area.id, { ...area, beds: area.beds.filter((_, i) => i !== index) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => patch(area.id, { ...area, beds: [...area.beds, { kind: 'double', count: 1 }] })}>
            Add a bed
          </button>
        </section>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => add(false)}>
          Add bedroom
        </button>
        <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => add(true)}>
          Add living area
        </button>
      </div>
      <StayHelp>
        These beds sleep up to {sleeps} guests. Living areas are not counted as bedrooms.
      </StayHelp>
      {Number.isFinite(guests) && guests > 0 && sleeps >= 1 && guests > sleeps ? (
        <p className="text-sm font-medium text-[#9a6700]" role="status">
          Maximum guests is set to {guests}, but these beds sleep {sleeps}. Lower the guest limit or add beds before publishing.
        </p>
      ) : null}
    </div>
  );
}

function DescriptionStage({ values, onChange, minDescription, maxDescription }: Props) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const length = values.description.trim().length;
  const short = length < minDescription;
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const fit = () => {
      const min = window.matchMedia('(min-width: 640px)').matches ? 280 : 220;
      const max = 520;
      field.style.height = 'auto';
      const needed = Math.max(min, field.scrollHeight);
      field.style.height = `${Math.min(needed, max)}px`;
      field.style.overflowY = needed > max ? 'auto' : 'hidden';
    };
    fit();
    const media = window.matchMedia('(min-width: 640px)');
    media.addEventListener('change', fit);
    return () => media.removeEventListener('change', fit);
  }, [values.description]);
  return (
    <div className="space-y-3">
      <Field label="Description">
        <textarea
          ref={fieldRef}
          className="tv-input stay-description-input w-full resize-y leading-relaxed"
          value={values.description}
          aria-label="Description"
          onChange={(e) => onChange({ description: clampListingDescriptionInput(e.target.value, values.description) })}
        />
      </Field>
      <StayHelp>Scroll inside the field when the text grows past the visible area. At least {minDescription} characters, up to {maxDescription}.</StayHelp>
      <p className={`text-xs ${short ? 'font-semibold text-[#9f1239]' : 'text-ink-muted'}`}>
        {length} / {maxDescription}. At least {minDescription} characters.
      </p>
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
  const amenities = stayAmenityDisplayList(values.stayAmenities.split(',').map((item) => item.trim()));
  const hints = stayHighlightAmenityHints(chosen, amenities);
  function toggle(label: string) {
    const has = chosen.some((line) => line.toLowerCase() === label.toLowerCase());
    const next = has ? chosen.filter((line) => line.toLowerCase() !== label.toLowerCase()) : [...chosen, label].slice(0, 8);
    onChange({ highlights: next });
  }
  function addCustom() {
    const value = draft.trim().slice(0, 80);
    if (!value || chosen.some((line) => line.toLowerCase() === value.toLowerCase()) || chosen.length >= 8) {
      setDraft('');
      return;
    }
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
                <button type="button" className="stay-choice lc-choice lc-choice--selected min-h-11 rounded-full px-3 text-sm font-semibold text-[#073b83]" onClick={() => toggle(line)}>
                  {line}
                </button>
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
            <StayChoice key={label} pressed={on} icon={stayHighlightIcon(label) ?? undefined} onClick={() => toggle(label)}>
              {label}
            </StayChoice>
          );
        })}
      </div>
      {custom.length > 0 ? <StayHelp>Your own lines are in Confirmed. Select one there to remove it.</StayHelp> : null}
      <Field label="Your own highlight">
        <div className="flex gap-2">
          <input
            className="tv-input min-w-0 flex-1"
            maxLength={80}
            value={draft}
            placeholder="Only something this property has"
            aria-label="Custom highlight"
            onChange={(e) => setDraft(e.target.value.slice(0, 80))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              addCustom();
            }}
          />
          <button type="button" className="tv-btn-secondary !min-h-11 shrink-0" onClick={addCustom} disabled={!draft.trim() || chosen.length >= 8}>
            Add
          </button>
        </div>
      </Field>
      {hints.length > 0 ? (
        <ul className="space-y-1" role="status">
          {hints.map((hint) => (
            <li key={hint} className="text-sm font-medium text-[#9a6700]">
              {hint}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BookingMethodStage() {
  return (
    <section className="stay-panel space-y-2" aria-labelledby="stay-booking-method-title">
      <p id="stay-booking-method-title" className="text-sm font-semibold text-ink">
        Instant booking
      </p>
      <p className="text-sm leading-relaxed text-ink-muted">
        Guests book available dates immediately and pay securely at checkout. This listing uses Instant booking only.
      </p>
      <p className="text-xs leading-relaxed text-ink-muted" role="note">
        No other booking method is available for stays here.
      </p>
    </section>
  );
}

function BookingTimesStage({ values, onChange, option }: Props & { option: StayAccommodationOption }) {
  const turnoverNote = stayTurnoverAdvisory(values.stayCheckIn, values.stayCheckOut);
  function setClock(key: 'stayCheckIn' | 'stayCheckOut', value: string) {
    const schedules = option.schedules.map((schedule, index) =>
      index === 0 ? { ...schedule, [key === 'stayCheckIn' ? 'checkIn' : 'checkOut']: value } : schedule
    );
    const rest = values.stayOptions.filter((row) => row.id !== option.id);
    onChange({ [key]: value, stayOptions: [{ ...option, schedules }, ...rest] });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Field label="Check-in from">
            <input
              className="tv-input w-full"
              type="time"
              value={values.stayCheckIn}
              aria-label="Check-in from"
              onChange={(e) => setClock('stayCheckIn', e.target.value)}
            />
          </Field>
          <p className="stay-help mt-1.5">Earliest arrival time on the property’s local clock.</p>
        </div>
        <div>
          <Field label="Checkout by">
            <input
              className="tv-input w-full"
              type="time"
              value={values.stayCheckOut}
              aria-label="Checkout by"
              onChange={(e) => setClock('stayCheckOut', e.target.value)}
            />
          </Field>
          <p className="stay-help mt-1.5">Latest departure time on the property’s local clock.</p>
        </div>
      </div>
      {turnoverNote ? (
        <p className="text-sm font-medium text-[#9a6700]" role="status">
          {turnoverNote}
        </p>
      ) : null}
    </div>
  );
}

function CutoffStage({ option, writeOption }: { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const saved = option.cutoffMinutes ?? 0;
  const untilCheckIn = saved <= 0;
  const known = saved > 0 ? stayCutoffFromMinutes(saved) : null;
  const unit: StayCutoffUnit = known?.unit ?? 'hours';
  const presetAmounts = stayCutoffAmounts(unit);
  const amounts =
    known && !presetAmounts.includes(known.amount)
      ? [...presetAmounts, known.amount].sort((left, right) => left - right)
      : presetAmounts;
  function write(nextUnit: StayCutoffUnit, amount: number) {
    writeOption({ ...option, cutoffMinutes: stayCutoffToMinutes(nextUnit, amount) });
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Time unit">
          <select
            className="tv-input w-full"
            value={unit}
            disabled={untilCheckIn}
            onChange={(event) => {
              const nextUnit = event.target.value as StayCutoffUnit;
              write(nextUnit, stayCutoffAmounts(nextUnit)[0]);
            }}
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </Field>
        <Field label="Amount">
          <select
            className="tv-input w-full"
            value={known ? String(known.amount) : ''}
            disabled={untilCheckIn}
            onChange={(event) => write(unit, Number(event.target.value))}
          >
            <option value="" disabled>
              Choose
            </option>
            {amounts.map((amount) => (
              <option key={amount} value={amount}>
                {amount}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`stay-quiet-suggest ${untilCheckIn ? 'ring-1 ring-[#073b83]/35' : ''}`}
          aria-pressed={untilCheckIn}
          onClick={() => writeOption({ ...option, cutoffMinutes: 0 })}
        >
          Until check-in
        </button>
        {untilCheckIn ? (
          <button
            type="button"
            className="stay-quiet-suggest"
            onClick={() => write('hours', 5)}
          >
            Use 5 hours
          </button>
        ) : null}
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
      <StayChoice
        pressed={values.stayAvailabilityMode === 'scheduled'}
        className="flex-col"
        onClick={() => {
          if (several) return;
          const start = season?.start || today;
          const end = season?.end || today;
          writeOption({
            ...option,
            availabilityMode: 'scheduled',
            schedules: [
              {
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
                maxNights: season?.maxNights ?? null,
              },
            ],
          });
        }}
      >
        A first and last night
        <span className="stay-help mt-1 block font-normal">Only nights from the first through the last occupied night can be booked.</span>
      </StayChoice>
      {several ? (
        <p className="text-sm text-ink-muted">This stay already has more than one schedule. Those seasons stay as they are. Change them after publishing.</p>
      ) : null}
      {values.stayAvailabilityMode === 'scheduled' && !several ? (
        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <TraverionSingleDateField
              id="stay-open-start"
              label="First occupied night"
              value={season?.start ?? ''}
              minIso={today}
              onChange={(start) => season && writeOption({ ...option, schedules: [{ ...season, start }] })}
            />
            <TraverionSingleDateField
              id="stay-open-end"
              label="Last occupied night"
              value={season?.end ?? ''}
              minIso={season?.start || today}
              onChange={(end) => season && writeOption({ ...option, schedules: [{ ...season, end }] })}
            />
          </div>
          <StayHelp>The last occupied night is included. The checkout morning after that night is not charged.</StayHelp>
        </div>
      ) : null}
      <StayHelp>You can update your availability, block specific dates, and manage your calendar anytime after creating your listing.</StayHelp>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange, shown }: { label: string; value: number; min: number; max: number; onChange: (next: number) => void; shown?: string }) {
  return (
    <div className="stay-panel flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="stay-step" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="w-8 text-center text-sm tabular-nums">{shown ?? value}</span>
        <button type="button" className="stay-step" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

function GuestsStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const sleeps = staySleepCapacity(option.bedMix);
  const cap = sleeps >= 1 ? sleeps : 50;
  const raw = Math.max(1, Number.parseInt(values.stayMaxGuests, 10) || option.maxGuests || 1);
  const guests = Math.min(raw, cap);
  useEffect(() => {
    if (sleeps < 1) return;
    if (option.maxGuests == null || option.maxGuests <= sleeps) return;
    writeOption({ ...option, maxGuests: sleeps });
    // Clamp only when sleep capacity drops below the saved guest limit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: beds/sleeps drive the correction
  }, [sleeps, option.maxGuests]);
  return (
    <div className="space-y-4">
      <Stepper
        label="Maximum guests"
        value={guests}
        min={1}
        max={cap}
        onChange={(maxGuests) => writeOption({ ...option, maxGuests: Math.min(maxGuests, cap) })}
      />
      {sleeps >= 1 ? (
        <StayHelp>The beds sleep up to {sleeps}. The guest limit cannot go above that.</StayHelp>
      ) : (
        <StayHelp>Add beds on the sleeping screen so the guest limit can match capacity.</StayHelp>
      )}
    </div>
  );
}

function StayLengthStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const minNights = Math.max(1, Number.parseInt(values.stayMinNights, 10) || option.minNights || 1);
  const maxNights = option.schedules[0]?.maxNights ?? null;
  const unlimited = maxNights == null;
  function setMax(next: number | null) {
    const season = option.schedules[0];
    if (!season) {
      if (next == null) return;
      writeOption({
        ...option,
        schedules: [
          {
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
            maxNights: next,
          },
        ],
      });
      return;
    }
    writeOption({ ...option, schedules: [{ ...season, maxNights: next }] });
  }
  return (
    <div className="space-y-3">
      <Stepper
        label="Minimum nights"
        value={minNights}
        min={1}
        max={365}
        onChange={(nights) => {
          const season = option.schedules[0];
          if (season?.maxNights != null && season.maxNights < nights) {
            writeOption({
              ...option,
              minNights: nights,
              schedules: option.schedules.map((row, index) => (index === 0 ? { ...row, maxNights: nights } : row)),
            });
            return;
          }
          writeOption({ ...option, minNights: nights });
        }}
      />
      <Stepper
        label="Maximum nights"
        value={maxNights ?? Math.max(minNights, 1)}
        min={minNights}
        max={365}
        shown={unlimited ? 'No limit' : undefined}
        onChange={(nights) => setMax(nights)}
      />
      <button
        type="button"
        className={`min-h-11 text-sm font-semibold ${unlimited ? 'text-[#073b83]' : 'text-finland'}`}
        aria-pressed={unlimited}
        onClick={() => setMax(null)}
      >
        {unlimited ? 'No maximum limit (selected)' : 'No maximum limit'}
      </button>
      <StayHelp>
        {unlimited
          ? 'No maximum stay length. Guests can book as many nights as the calendar allows, subject to the minimum.'
          : `Guests can book between ${minNights} and ${maxNights} night${maxNights === 1 ? '' : 's'}. Checkout uses the same limits.`}
      </StayHelp>
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
          <p className="stay-kicker">One night</p>
          <div className="flex justify-between gap-3"><dt>Guest pays</dt><dd className="tabular-nums">{exactMoney(nightly, currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Traverion commission ({formatBpsAsPercent(split.commissionBps)})</dt><dd className="tabular-nums">{exactMoney(split.commissionMinor / 100, currency)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-[#E6EAF0] pt-2 font-semibold"><dt>Supplier receives</dt><dd className="tabular-nums">{exactMoney(split.supplierMinor / 100, currency)}</dd></div>
          <p className="stay-help">Breakdown for one night using your active agreement. Cleaning and extras are charged separately at checkout.</p>
        </dl>
      ) : priced ? (
        <StayHelp>Supplier earnings appear when your active agreement is available. This example is one night only. Cleaning and extras are charged separately at checkout.</StayHelp>
      ) : null}
    </div>
  );
}

function extraAmount(raw: string): number {
  const cleaned = raw.replace(/-/g, '').replace(',', '.').trim();
  if (!cleaned) return 0;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.min(100000, Math.round(amount * 100) / 100);
}

function blankExtra(): StaySeasonExtra {
  return { id: newStayOptionId(), name: '', description: '', price: 0, charge: 'per_stay', mandatory: false, maxQuantity: 1 };
}

function FeesStage({ values, currency, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const extras = option.schedules[0]?.extras ?? [];
  function writeExtras(next: StaySeasonExtra[]) {
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
    writeOption({ ...option, schedules: [{ ...season, extras: next.slice(0, 12) }, ...option.schedules.slice(1)] });
  }
  return (
    <div className="space-y-4">
      <Field label={`Cleaning fee · ${currency}, per stay`}>
        <input className="tv-input w-full" inputMode="decimal" value={values.stayCleaningFee} onChange={(e) => {
          const cleaning = Number(e.target.value);
          writeOption({ ...option, cleaningFee: Number.isFinite(cleaning) && cleaning >= 0 ? Math.round(cleaning * 100) / 100 : null });
        }} />
      </Field>
      <StayHelp>Cleaning is mandatory when set. It is added once to the checkout total, not to the nightly rate. Leave it blank when there is no cleaning fee.</StayHelp>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Additional extras</p>
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-finland disabled:opacity-40"
            disabled={extras.length >= 12}
            onClick={() => writeExtras([...extras, blankExtra()])}
          >
            + Add extra
          </button>
        </div>
        <StayHelp>Optional extras appear at checkout and are charged only when the guest selects them. They are not folded into the nightly price.</StayHelp>
        {extras.map((extra, index) => (
          <div key={extra.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-center">
            <input
              className="tv-input w-full"
              value={extra.name}
              maxLength={80}
              placeholder="Extra towels"
              aria-label={`Extra ${index + 1} name`}
              onChange={(event) => writeExtras(extras.map((row) => row.id === extra.id ? { ...row, name: event.target.value.slice(0, 80) } : row))}
            />
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm font-semibold text-ink-muted">{currency}</span>
              <input
                className="tv-input w-full"
                inputMode="decimal"
                value={extra.price > 0 ? String(extra.price) : ''}
                placeholder="10"
                aria-label={`Extra ${index + 1} amount`}
                onChange={(event) => writeExtras(extras.map((row) => row.id === extra.id ? { ...row, price: extraAmount(event.target.value), mandatory: false, charge: 'per_stay' } : row))}
              />
            </div>
            <button type="button" className="min-h-11 justify-self-start text-sm font-semibold text-ink-muted sm:justify-self-end" onClick={() => writeExtras(extras.filter((row) => row.id !== extra.id))}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <StayHelp>Weekly and monthly discounts and extra-guest fees already saved on a schedule apply to the lodging price at checkout.</StayHelp>
    </div>
  );
}

function ArrivalMethodStage({ values, onChange }: Props) {
  const conflict = staySelfCheckInConflict(
    values.stayAmenities.split(',').map((item) => item.trim()),
    values.stayArrivalMethod
  );
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
      {conflict && values.stayArrivalMethod ? (
        <p className="text-sm font-medium text-[#9a6700]" role="status">
          {conflict}
        </p>
      ) : null}
    </div>
  );
}

function ArrivalNotesStage({ values, onChange }: Props) {
  const publicRef = useRef<HTMLTextAreaElement>(null);
  const privateRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    for (const field of [publicRef.current, privateRef.current]) {
      if (!field) continue;
      field.style.height = '140px';
      field.style.height = `${Math.max(140, field.scrollHeight)}px`;
    }
  }, [values.stayArrivalNote, values.stayCheckInAddress]);
  return (
    <div className="space-y-4">
      <div className="stay-panel space-y-2">
        <Field label="Public arrival note">
          <textarea ref={publicRef} className="tv-input stay-note-input w-full resize-y" maxLength={160} value={values.stayArrivalNote} aria-label="Public arrival note" onChange={(e) => onChange({ stayArrivalNote: e.target.value.slice(0, 160) })} />
        </Field>
        <StayHelp>Shown on the public listing before booking. Do not include a door code or the street address.</StayHelp>
      </div>
      <div className="stay-panel space-y-2">
        <Field label="Private arrival address">
          <textarea ref={privateRef} className="tv-input stay-note-input w-full resize-y" maxLength={400} value={values.stayCheckInAddress} aria-label="Private arrival address" onChange={(e) => onChange({ stayCheckInAddress: e.target.value.slice(0, 400) })} />
        </Field>
        <StayHelp>Only confirmed guests see this after payment. It is never shown on the public listing or before an authorized booking. Codes belong here.</StayHelp>
      </div>
    </div>
  );
}

function GalleryStage(props: Props) {
  const count = props.values.photoSlots.filter((url) => url.startsWith('http')).length;
  return (
    <div className="space-y-3">
      <ListingImageFields
        presentation="stay"
        photoSlots={props.values.photoSlots}
        photoSlotLabels={props.values.photoSlotLabels}
        photoOriginalUrls={props.values.photoOriginalUrls}
        photoCropSettings={props.values.photoCropSettings}
        userId={props.userId}
        uploadsEnabled={props.uploadsEnabled}
        onPhotosChange={({ slots, labels, originals, crops }) =>
          props.onChange({ photoSlots: slots, photoSlotLabels: labels, photoOriginalUrls: originals, photoCropSettings: crops })
        }
      />
      <StayHelp>
        {count === 0
          ? 'Add at least one photo to continue. Publishing still requires a full gallery, with the first photo as the cover.'
          : `You have ${count} photo${count === 1 ? '' : 's'}. The first photo is the cover. Order, remove, or replace photos anytime; drafts keep them after refresh.`}
      </StayHelp>
    </div>
  );
}

function CancellationStage() {
  return (
    <section className="stay-panel space-y-3">
      <div>
        <p className="stay-kicker">Traverion standard</p>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink">Cancel free of charge until 24 hours before check-in</p>
      </div>
      <p className="text-sm leading-relaxed text-ink">{STAY_GUEST_CANCELLATION_POLICY}</p>
      <p className="text-sm leading-relaxed text-ink-muted">
        Guests see these terms before they pay. Each booking keeps the cancellation terms from that moment.
      </p>
    </section>
  );
}

function HouseRulesStage({ values, onChange }: Props) {
  const rules = values.stayHouseRules.toLowerCase();
  const petsConflict = values.stayPets === 'not_allowed' && /pets welcome|pet friendly/.test(rules);
  return (
    <div className="space-y-4">
      <Choice label="Pets" value={values.stayPets} options={[['allowed', 'Allowed'], ['not_allowed', 'Not allowed'], ['approval', 'Ask first']]} onChange={(stayPets) => onChange({ stayPets })} />
      {values.stayPets === 'approval' ? (
        <StayHelp>Ask first tells guests to contact you. It does not open an approval workflow or grant permission by itself.</StayHelp>
      ) : null}
      <Choice label="Smoking" value={values.staySmoking} options={[['not_allowed', 'Not allowed'], ['allowed', 'Allowed']]} onChange={(staySmoking) => onChange({ staySmoking })} />
      <Choice label="Parties" value={values.stayParties} options={[['not_allowed', 'Not allowed'], ['allowed', 'Allowed']]} onChange={(stayParties) => onChange({ stayParties })} />
      <Choice label="Children" value={values.stayChildren} options={[['', 'No extra rule'], ['welcome', 'Welcome'], ['not_suitable', 'Not suitable']]} onChange={(stayChildren) => onChange({ stayChildren })} />
      {petsConflict ? <p className="text-sm font-medium text-red-700">The written rules welcome pets, but pets are set to not allowed. Change one of them.</p> : null}
    </div>
  );
}

function QuietHoursStage({ values, onChange }: Props) {
  const rulesRef = useRef<HTMLTextAreaElement>(null);
  const mentioned = quietHoursMentioned(values.stayHouseRules);
  const differs = mentioned && (values.stayQuietStart !== mentioned.start || values.stayQuietEnd !== mentioned.end);
  const defaultQuiet = values.stayQuietStart !== '22:00' || values.stayQuietEnd !== '06:00';
  useLayoutEffect(() => {
    const field = rulesRef.current;
    if (!field) return;
    field.style.height = '7.5rem';
    field.style.height = `${Math.max(120, field.scrollHeight)}px`;
  }, [values.stayHouseRules]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quiet hours from"><input className="tv-input w-full" type="time" value={values.stayQuietStart} onChange={(e) => onChange({ stayQuietStart: e.target.value })} /></Field>
        <Field label="Until"><input className="tv-input w-full" type="time" value={values.stayQuietEnd} onChange={(e) => onChange({ stayQuietEnd: e.target.value })} /></Field>
      </div>
      <StayHelp>Quiet hours may cross midnight, for example 22:00 until 06:00.</StayHelp>
      <div className="flex flex-wrap gap-2">
        {defaultQuiet ? (
          <button
            type="button"
            className="stay-quiet-suggest"
            onClick={() => onChange({ stayQuietStart: '22:00', stayQuietEnd: '06:00' })}
          >
            Use 22:00–06:00
          </button>
        ) : null}
        {differs && mentioned ? (
          <button
            type="button"
            className="stay-quiet-suggest"
            onClick={() => onChange({ stayQuietStart: mentioned.start, stayQuietEnd: mentioned.end })}
          >
            Use {mentioned.start}–{mentioned.end} from written rules
          </button>
        ) : null}
      </div>
      {differs && mentioned ? (
        <StayHelp>This fills the times above and leaves your written rules unchanged.</StayHelp>
      ) : null}
      <Field label="Additional rules">
        <textarea
          ref={rulesRef}
          className="tv-input stay-rules-input w-full resize-y"
          maxLength={2000}
          value={values.stayHouseRules}
          aria-label="Additional house rules"
          onChange={(e) => onChange({ stayHouseRules: e.target.value.slice(0, 2000) })}
        />
      </Field>
    </div>
  );
}

function SafetyStage({ values, onChange }: Props) {
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = notesRef.current;
    if (!field) return;
    field.style.height = '6.5rem';
    field.style.height = `${Math.max(104, field.scrollHeight)}px`;
  }, [values.staySafetyNote]);
  function toggleConsideration(id: string) {
    const selected = new Set(values.staySafetyConsiderations);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    onChange({ staySafetyConsiderations: STAY_SAFETY_CONSIDERATIONS.map((row) => row.id).filter((item) => selected.has(item)) });
  }
  return (
    <div className="space-y-4">
      <label className="stay-panel flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <span className="stay-choice-icon">{staySafetyIcon()}</span>
        <input type="checkbox" className="h-4 w-4" checked={values.stayExteriorCamera} onChange={(e) => onChange({ stayExteriorCamera: e.target.checked })} />
        There is an exterior security camera
      </label>
      {values.stayExteriorCamera ? (
        <Field label="Where is the camera located?">
          <input
            className="tv-input w-full"
            maxLength={160}
            value={values.stayCameraLocation}
            placeholder="For example: Outside the main entrance, facing the driveway."
            aria-label="Where is the camera located?"
            onChange={(e) => onChange({ stayCameraLocation: e.target.value.slice(0, 160) })}
          />
        </Field>
      ) : null}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">Other safety information</p>
        <StayHelp>Optional. Leaving these unselected does not certify that no hazards exist.</StayHelp>
        <div className="flex flex-wrap gap-2">
          {STAY_SAFETY_CONSIDERATIONS.map((row) => {
            const on = values.staySafetyConsiderations.includes(row.id);
            return (
              <button
                key={row.id}
                type="button"
                aria-pressed={on}
                className={`stay-choice lc-choice min-h-11 rounded-full px-3 text-sm font-semibold ${on ? 'lc-choice--selected text-[#073b83]' : ''}`}
                onClick={() => toggleConsideration(row.id)}
              >
                {row.label}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Safety notes, optional">
        <textarea
          ref={notesRef}
          className="tv-input stay-safety-input w-full resize-y"
          maxLength={160}
          value={values.staySafetyNote}
          aria-label="Safety notes"
          onChange={(e) => onChange({ staySafetyNote: e.target.value.slice(0, 160) })}
        />
      </Field>
      <StayHelp>Cameras inside private guest spaces are not allowed. Guests see these disclosures before they book.</StayHelp>
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

function PreviewEdit({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="stay-preview-edit min-h-11 shrink-0 text-sm font-semibold text-finland" onClick={onClick}>
      Edit
    </button>
  );
}

function PreviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="stay-preview-section">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h5 className="font-display text-base font-semibold text-ink sm:text-lg">{title}</h5>
        <PreviewEdit onClick={onEdit} />
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

function previewBedLine(area: StaySleepingArea): string {
  const parts = area.beds.map((bed) => {
    const label = STAY_BED_KINDS.find((kind) => kind.id === bed.kind)?.label ?? 'Bed';
    return `${bed.count} ${label.toLowerCase()}${bed.count === 1 ? '' : 's'}`;
  });
  return parts.join(', ');
}

function PreviewStage({ values, currency, onEditStage, option }: Props & { option: StayAccommodationOption }) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const propertyType = (option.propertyType || values.stayPropertyType || '').trim() || 'Stay';
  const typeLabel = propertyType === 'Room' ? 'Private room' : propertyType;
  const photos = values.photoSlots.filter((url) => url.startsWith('http'));
  const cover = photos[0];
  const sidePhotos = photos.slice(1, 4);
  const remainingPhotos = Math.max(0, photos.length - 4);
  const amenities = stayAmenityDisplayList(values.stayAmenities.split(',').map((item) => item.trim()));
  const visibleAmenities = amenitiesOpen ? amenities : amenities.slice(0, 8);
  const highlights = values.highlights.map((line) => line.trim()).filter(Boolean);
  const nightly = Number.parseFloat(values.stayNightly);
  const cleaning = Number.parseFloat(values.stayCleaningFee);
  const sleeps = staySleepCapacity(option.bedMix);
  const beds = stayBedSummary(option.bedMix);
  const guests = Number.parseInt(values.stayMaxGuests, 10);
  const bedrooms = Number.parseInt(values.stayBedrooms, 10);
  const bedroomCount = Number.isFinite(bedrooms) ? bedrooms : option.bedrooms ?? 0;
  const description = values.description.trim();
  const descriptionLong = description.length > 280;
  const descriptionShown = descriptionOpen || !descriptionLong ? description : `${description.slice(0, 280).trimEnd()}…`;
  const sleepingAreas = option.sleepingAreas.filter((area) => area.beds.some((bed) => bed.count > 0));
  const extras = (option.schedules[0]?.extras ?? []).filter((extra) => extra.name.trim() && extra.price > 0);
  const ruleChips = [
    values.stayPets ? `Pets · ${readableRule(values.stayPets)}` : '',
    values.staySmoking ? `Smoking · ${readableRule(values.staySmoking)}` : '',
    values.stayParties ? `Parties · ${readableRule(values.stayParties)}` : '',
    values.stayChildren ? `Children · ${readableRule(values.stayChildren)}` : '',
    values.stayQuietStart && values.stayQuietEnd ? `Quiet hours ${values.stayQuietStart}–${values.stayQuietEnd}` : '',
  ].filter(Boolean);
  const safetyLines = [
    values.stayExteriorCamera
      ? `Exterior security camera${values.stayCameraLocation.trim() ? `: ${values.stayCameraLocation.trim()}` : ''}`
      : '',
    ...staySafetyConsiderationLines(values.staySafetyConsiderations),
    values.staySafetyNote.trim(),
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <article className="stay-preview-shell overflow-hidden rounded-2xl bg-white ring-1 ring-[#E6EAF0]">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-2">
            <div className="stay-preview-gallery">
              <div className={`stay-preview-gallery-main ${sidePhotos.length > 0 ? '' : 'stay-preview-gallery-main--solo'}`}>
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[12rem] items-center justify-center bg-[#F4F6F8] text-sm text-ink-muted">Add a cover photo</div>
                )}
              </div>
              {sidePhotos.length > 0 ? (
                <div className="stay-preview-gallery-side">
                  {sidePhotos.map((url, index) => {
                    const isLast = index === sidePhotos.length - 1 && remainingPhotos > 0;
                    return (
                      <button
                        key={url}
                        type="button"
                        className="stay-preview-gallery-thumb relative overflow-hidden rounded-lg"
                        onClick={() => setGalleryOpen(true)}
                        aria-label={isLast ? `Show ${remainingPhotos} more photos` : `Photo ${index + 2}`}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        {isLast ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">
                            +{remainingPhotos}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {photos.length > 1 ? (
              <button type="button" className="text-sm font-semibold text-finland" onClick={() => setGalleryOpen((open) => !open)}>
                {galleryOpen ? 'Hide photo list' : `View all ${photos.length} photos`}
              </button>
            ) : (
              <div className="flex justify-end">
                <PreviewEdit onClick={() => onEditStage(stayScreenIndex('photos'))} />
              </div>
            )}
            {galleryOpen && photos.length > 1 ? (
              <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {photos.map((url, index) => (
                  <li key={`all-${url}`} className="overflow-hidden rounded-md ring-1 ring-[#E6EAF0]">
                    <img src={url} alt="" className={`aspect-square w-full object-cover ${index === 0 ? 'ring-2 ring-inset ring-[#073b83]' : ''}`} />
                  </li>
                ))}
              </ul>
            ) : null}
            {photos.length > 1 ? (
              <div className="flex justify-end">
                <PreviewEdit onClick={() => onEditStage(stayScreenIndex('photos'))} />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="stay-kicker">{typeLabel}</p>
              <PreviewEdit onClick={() => onEditStage(stayScreenIndex('property-type'))} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{values.title || 'Untitled stay'}</h4>
              <PreviewEdit onClick={() => onEditStage(stayScreenIndex('property-name'))} />
            </div>
            <p className="text-sm text-ink-muted">{[values.city, values.country].filter(Boolean).join(', ') || 'Location not set'}</p>
            {Number.isFinite(nightly) && nightly > 0 ? (
              <p className="text-lg font-semibold tabular-nums text-ink">
                {formatMoney(nightly, currency)} <span className="text-sm font-medium text-ink-muted">per night · one night</span>
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-2 border-t border-[#E6EAF0] pt-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="stay-kicker">Guests</dt>
                <dd className="mt-1 font-semibold text-ink">{Number.isFinite(guests) && guests > 0 ? guests : '—'}</dd>
              </div>
              <div>
                <dt className="stay-kicker">Bedrooms</dt>
                <dd className="mt-1 font-semibold text-ink">{bedroomCount}</dd>
              </div>
              <div>
                <dt className="stay-kicker">Beds</dt>
                <dd className="mt-1 font-semibold text-ink">{stayBedCount(option.bedMix) || '—'}</dd>
              </div>
              <div>
                <dt className="stay-kicker">Sleeps</dt>
                <dd className="mt-1 font-semibold text-ink">{sleeps > 0 ? sleeps : '—'}</dd>
              </div>
            </dl>
            <div className="flex items-start justify-between gap-3">
              {values.subtitle.trim() ? (
                <p className="text-sm leading-relaxed text-ink-muted">{values.subtitle.trim()}</p>
              ) : (
                <p className="text-sm text-ink-muted">Add a short introduction.</p>
              )}
              <PreviewEdit onClick={() => onEditStage(stayScreenIndex('property-intro'))} />
            </div>
          </div>
        </div>

        <div className="stay-preview-body grid gap-0 border-t border-[#E6EAF0] px-4 py-4 sm:px-5 lg:grid-cols-2 lg:gap-x-8">
          {description ? (
            <PreviewSection title="About this place" onEdit={() => onEditStage(stayScreenIndex('description'))}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{descriptionShown}</p>
              {descriptionLong ? (
                <button type="button" className="mt-2 text-sm font-semibold text-finland" onClick={() => setDescriptionOpen((open) => !open)}>
                  {descriptionOpen ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </PreviewSection>
          ) : (
            <PreviewSection title="About this place" onEdit={() => onEditStage(stayScreenIndex('description'))}>
              <p className="text-sm text-ink-muted">Add a description.</p>
            </PreviewSection>
          )}

          {highlights.length > 0 ? (
            <PreviewSection title="Property highlights" onEdit={() => onEditStage(stayScreenIndex('highlights'))}>
              <ul className="flex flex-wrap gap-2">
                {highlights.map((line) => (
                  <li key={line} className="rounded-full bg-[#F4F6F8] px-3 py-1 text-sm text-ink">
                    {line}
                  </li>
                ))}
              </ul>
            </PreviewSection>
          ) : null}

          {amenities.length > 0 ? (
            <PreviewSection title="Amenities" onEdit={() => onEditStage(stayScreenIndex('amenities'))}>
              <ul className="flex flex-wrap gap-2">
                {visibleAmenities.map((item) => (
                  <li key={item} className="rounded-full bg-[#F4F6F8] px-3 py-1 text-sm text-ink">
                    {item === 'Wifi' ? 'Wi-Fi' : item}
                  </li>
                ))}
              </ul>
              {amenities.length > 8 ? (
                <button type="button" className="mt-2 text-sm font-semibold text-finland" onClick={() => setAmenitiesOpen((open) => !open)}>
                  {amenitiesOpen ? 'Show fewer amenities' : `Show ${amenities.length - 8} more`}
                </button>
              ) : null}
            </PreviewSection>
          ) : null}

          <PreviewSection title="Sleeping arrangements" onEdit={() => onEditStage(stayScreenIndex('rooms'))}>
            {sleepingAreas.length > 0 ? (
              <ul className="space-y-2 text-sm text-ink">
                {sleepingAreas.map((area) => (
                  <li key={area.id}>
                    <span className="font-semibold">{area.name || 'Sleeping area'}</span>
                    <span className="text-ink-muted"> · {previewBedLine(area) || 'Beds not set'}</span>
                  </li>
                ))}
              </ul>
            ) : beds ? (
              <p className="text-sm text-ink">
                {beds.charAt(0).toUpperCase()}
                {beds.slice(1)}
                {sleeps > 0 ? ` · sleeps ${sleeps}` : ''}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Add beds for guests.</p>
            )}
          </PreviewSection>

          <PreviewSection title="Arrival" onEdit={() => onEditStage(stayScreenIndex('arrival-method'))}>
            <p className="text-sm text-ink">{stayArrivalMethodLabel(values.stayArrivalMethod) || 'Arrival method not set'}</p>
            {values.stayArrivalNote.trim() ? <p className="mt-1 text-sm text-ink-muted">{values.stayArrivalNote.trim()}</p> : null}
            <p className="mt-2 text-xs text-ink-muted">Private check-in instructions stay off this preview.</p>
          </PreviewSection>

          {(ruleChips.length > 0 || values.stayHouseRules.trim()) ? (
            <PreviewSection title="House rules" onEdit={() => onEditStage(stayScreenIndex('house-rules'))}>
              {ruleChips.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {ruleChips.map((rule) => (
                    <li key={rule} className="rounded-full bg-[#F4F6F8] px-3 py-1 text-sm text-ink">
                      {rule}
                    </li>
                  ))}
                </ul>
              ) : null}
              {values.stayHouseRules.trim() ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{values.stayHouseRules.trim()}</p>
              ) : null}
            </PreviewSection>
          ) : null}

          {safetyLines.length > 0 ? (
            <PreviewSection title="Safety" onEdit={() => onEditStage(stayScreenIndex('safety'))}>
              <ul className="space-y-1 text-sm text-ink">
                {safetyLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </PreviewSection>
          ) : null}

          <PreviewSection title="Fees" onEdit={() => onEditStage(stayScreenIndex('fees'))}>
            <ul className="space-y-1 text-sm text-ink">
              <li>
                Cleaning ·{' '}
                {Number.isFinite(cleaning) && cleaning > 0 ? `${formatMoney(cleaning, currency)} per stay` : 'None'}
              </li>
              {extras.length > 0 ? (
                extras.map((extra) => (
                  <li key={extra.id}>
                    {extra.name.trim()} · {formatMoney(extra.price, currency)} optional
                  </li>
                ))
              ) : (
                <li className="text-ink-muted">No optional extras configured.</li>
              )}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">Optional extras are charged only when a guest selects them.</p>
          </PreviewSection>
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
          <p className="mt-2 text-xs text-ink-muted">
            The example uses the same pricing rules as checkout. It does not create a reservation. The street address stays private.
          </p>
        </div>
      </details>
    </div>
  );
}

type PublishRow = { id: string; label: string; optional?: boolean };

function PublishStage({ values, onEditStage, option, locationConfirmed, minTitle, maxTitle, maxSubtitle, minDescription, publishIssues = [] }: Props & { option: StayAccommodationOption }) {
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
    maxTitle,
    subtitle: values.subtitle,
    maxSubtitle,
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
    cameraLocation: values.stayCameraLocation,
    safetyNote: values.staySafetyNote,
  };
  const groups: { title: string; rows: PublishRow[] }[] = [
    { title: 'Place', rows: [{ id: 'location', label: 'Location' }, { id: 'confirm', label: 'Map pin' }] },
    {
      title: 'Property',
      rows: [
        { id: 'property-type', label: 'Property type' },
        { id: 'property-name', label: 'Name' },
        { id: 'property-intro', label: 'Introduction' },
        { id: 'description', label: 'Description' },
        { id: 'rooms', label: 'Sleeping' },
        { id: 'guests', label: 'Guests' },
      ],
    },
    {
      title: 'Stay details',
      rows: [
        { id: 'booking-times', label: 'Check-in times' },
        { id: 'stay-length', label: 'Stay length' },
        { id: 'arrival-method', label: 'Arrival method' },
        { id: 'arrival-notes', label: 'Arrival notes' },
      ],
    },
    {
      title: 'Pricing and availability',
      rows: [
        { id: 'price', label: 'Nightly price' },
        { id: 'fees', label: 'Cleaning and extras', optional: true },
        { id: 'availability', label: 'Availability', optional: true },
      ],
    },
    { title: 'Photos', rows: [{ id: 'photos', label: 'Property photos' }, { id: 'room-photos', label: 'Room photos', optional: true }] },
    {
      title: 'Policies and safety',
      rows: [
        { id: 'cancellation', label: 'Cancellation', optional: true },
        { id: 'house-rules', label: 'House preferences' },
        { id: 'quiet-hours', label: 'Quiet hours', optional: true },
        { id: 'safety', label: 'Safety' },
      ],
    },
  ];
  const requiredOpen = groups
    .flatMap((group) => group.rows.filter((row) => !row.optional).map((row) => ({ ...row, issue: stayStageBlocker(row.id, check) })))
    .filter((row) => row.issue);
  const ready = requiredOpen.length === 0 && publishIssues.length === 0;

  return (
    <div className="space-y-4">
      <div className="stay-panel flex flex-col gap-3 sm:flex-row sm:items-center">
        {cover ? (
          <img src={cover} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F8] text-xs text-ink-muted">No photo</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold text-ink">{values.title || 'Untitled stay'}</p>
          <p className="text-sm text-ink-muted">{[values.city, values.country].filter(Boolean).join(', ') || 'Location not set'}</p>
          <p className={`mt-1 text-sm font-semibold ${ready ? 'text-[#073b83]' : 'text-[#9f1239]'}`}>
            {ready ? 'Ready to publish' : `${requiredOpen.length + publishIssues.length} still need attention`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((group) => {
          const rows = group.rows.map((row) => {
            const issue = stayStageBlocker(row.id, check);
            const status = issue ? 'Needs attention' : row.optional ? 'Optional' : 'Complete';
            return { ...row, issue, status };
          });
          const attention = rows.filter((row) => row.issue).length;
          const complete = attention === 0;
          const body = (
            <ul className="overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 border-t border-[#E6EAF0] px-3 py-2.5 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{row.label}</p>
                    <p className={`text-xs ${row.issue ? 'font-medium text-[#9f1239]' : 'text-ink-muted'}`}>
                      {row.issue ?? row.status}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 shrink-0 text-sm font-semibold text-finland"
                    onClick={() => onEditStage(stayScreenIndex(row.id))}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          );
          if (complete) {
            return (
              <details key={group.title} className="space-y-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-sm font-semibold text-ink">
                  <span>{group.title}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#073b83]">Complete</span>
                </summary>
                {body}
              </details>
            );
          }
          return (
            <section key={group.title} className="space-y-2">
              <div className="flex items-center justify-between gap-3 px-1">
                <h4 className="text-sm font-semibold text-ink">{group.title}</h4>
                <span className="text-xs font-semibold uppercase tracking-wide text-[#9f1239]">
                  {attention} need{attention === 1 ? 's' : ''} attention
                </span>
              </div>
              {body}
            </section>
          );
        })}
      </div>

      {publishIssues.length > 0 ? (
        <ul className="stay-alert space-y-1">
          {publishIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <StayHelp>
        {ready
          ? 'Use Publish property below. Nothing is published until you do. A listing that is already live uses Save changes.'
          : 'Finish the required items above before publishing. Guests still see only the city until a booking is paid.'}
      </StayHelp>
    </div>
  );
}

