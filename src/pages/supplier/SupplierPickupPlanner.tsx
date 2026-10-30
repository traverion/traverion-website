/**
 * Supplier: pickup planner – bookings with meeting / pickup, filters, CSV, deep link to edit listing pickup fields.
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { Download, CalendarDays } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  fetchBookingsForSupplier,
  saveSupplierPickupDetails,
  type SaveSupplierPickupInput,
} from '../../data/supabase-bookings';
import { fetchMyListings, fetchListingById, pgTimeToHm } from '../../data/supabase-listings';
import type { BookingRow } from '../../data/supabase-bookings';
import { openSupplierListingEditor, openSupplierInbox, navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import { insertSupplierExportRun } from '../../data/supabase-supplier-campaigns-exports';
import {
  isPurchaseSnapshot,
  displayListingTitleFromPurchase,
  partnerListingFilterLabelFromBookings,
  displayOptionLabelFromPurchase,
  displayFulfillmentFromPurchase,
} from '../../lib/purchase-snapshot';
import { SUPPLIER_PAGE_CLASS, SupplierEmptyState, SupplierListSkeleton } from '../../components/supplier/supplierUi';
import ErrorState from '../../components/ErrorState';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { partnerBookingIsLiveTrip, partnerBookingIsOperatingTrip, partnerTourMatchesExperienceDayOffset } from '../../lib/trip-views';
import { PARTNER_PICKUP_CSV_HEADER, partnerPickupCsvValues } from '../../lib/partner-pickup-csv';
import PickupPlannerWorkspace from '../../components/supplier/PickupPlannerWorkspace';
import { pickupAreaFromOption, travelerPickupAddressFromRecord } from '../../lib/pickup-area';
import { parseBookingPickupInstructionsOverride, parsePickupDraft } from '../../lib/booking-notes';
import { effectiveMeetingTimeHm, pickupDepartureKey } from '../../lib/pickup-planner';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { csvSafeCell } from '../../lib/csv-export';
import {
  bookingIsRental,
  bookingIsStayNight,
  bookingNeedsPickupCopy,
  resolvePartnerPickupCopy,
} from '../../lib/pickup-completeness';
import { parseListingExtras, materializedBookingOptions } from '../../types/listingExtras';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import { partnerBookingNumberMatchesFilterQuery } from '../../lib/partner-bookings-search';

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SupplierPickupPlanner() {
  const { user, isSupabase } = useSupplierAuth();
  const { role } = useSupplierRole();
  const canEditBookings = canManageBookings(role);
  // Phase 1768: finance may export pickup guest PII (parity with Money + Bookings CSV).
  const canExportPickupCsv = canEditBookings || canManageFinance(role);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [meetingPoints, setMeetingPoints] = useState<Record<string, string>>({});
  const [pickupInstructions, setPickupInstructions] = useState<Record<string, string>>({});
  const [optionsByListing, setOptionsByListing] = useState<
    Record<
      string,
      Array<{
        id: string;
        pickupPlace: string;
        optionInfo: string;
        travelerStartInstructions?: string;
      }>
    >
  >({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [plannerOptions, setPlannerOptions] = useState<
    Record<string, Array<{ id: string; label: string; fulfillment: 'pickup' | 'meeting_point' | null; area: ReturnType<typeof pickupAreaFromOption>; instructions: string }>>
  >({});
  const [stayListingIds, setStayListingIds] = useState<Set<string>>(() => new Set());
  /** Rental listings — collection/return ops, never tour pickup rows. */
  const [rentalListingIds, setRentalListingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window === 'undefined') return '';
    const d = (new URLSearchParams(window.location.search).get('from') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window === 'undefined') return '';
    const d = (new URLSearchParams(window.location.search).get('to') ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  });
  const [dayPreset, setDayPreset] = useState<'today' | 'tomorrow' | null>(() => {
    if (typeof window === 'undefined') return null;
    const d = (new URLSearchParams(window.location.search).get('day') ?? '').trim();
    return d === 'today' || d === 'tomorrow' ? d : null;
  });
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listingFilterId, setListingFilterId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('listing') ?? '').trim();
  });
  const [departureId, setDepartureId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const id = new URLSearchParams(window.location.search).get('departure');
    return id && id.length > 0 ? id : null;
  });
  const [showAllDates, setShowAllDates] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('range') === 'all';
  });
  const [needsPickupOnly, setNeedsPickupOnly] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('needs') === '1';
  });
  const sortDate = 'asc' as const;
  const [filterQuery, setFilterQuery] = useState('');
  const [dayPage, setDayPage] = useState(1);
  const bookingsLenRef = useRef(0);

  const loadGenRef = useRef(0);
  const pickupPlannerHubUserIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const uid = user?.id;
    if (!isSupabase || !uid) {
      setLoading(false);
      return;
    }
    const gen = ++loadGenRef.current;
    // Soft refresh when pickups are already on screen — avoids skeleton flash on warm hops.
    if (bookingsLenRef.current === 0) setLoading(true);
    setError(null);
    try {
      const [bookingsList, listings] = await Promise.all([
        fetchBookingsForSupplier(uid),
        fetchMyListings(uid),
      ]);
      if (gen !== loadGenRef.current) return;
      const titles: Record<string, string> = {};
      const points: Record<string, string> = {};
      const instructions: Record<string, string> = {};
      const optionsMap: Record<
        string,
        Array<{
          id: string;
          pickupPlace: string;
          optionInfo: string;
          travelerStartInstructions?: string;
        }>
      > = {};
      const stayIds = new Set<string>();
      const images: Record<string, string> = {};
      const planner: Record<string, Array<{ id: string; label: string; fulfillment: 'pickup' | 'meeting_point' | null; area: ReturnType<typeof pickupAreaFromOption>; instructions: string }>> = {};
      const absorbListing = (l: {
        id: string;
        title: string;
        meetingPoint?: string | null;
        pickupInstructions?: string | null;
        listingExtras?: unknown;
        image?: string | null;
      }) => {
        titles[l.id] = l.title;
        points[l.id] = l.meetingPoint?.trim() ?? '';
        instructions[l.id] = l.pickupInstructions?.trim() ?? '';
        const materialized = materializedBookingOptions(parseListingExtras(l.listingExtras as unknown).bookingOptions);
        optionsMap[l.id] = materialized.map((o) => ({
          id: o.id,
          pickupPlace: o.pickupPlace,
          optionInfo: o.optionInfo,
          travelerStartInstructions: o.travelerStartInstructions,
        }));
        planner[l.id] = materialized.map((o) => ({
          id: o.id,
          label: o.name?.trim() || o.optionInfo?.trim() || o.pickupPlace?.trim() || 'Option',
          fulfillment: o.fulfillment === 'pickup' || o.fulfillment === 'meeting_point' ? o.fulfillment : null,
          area: pickupAreaFromOption(o),
          instructions: (o.travelerStartInstructions || o.optionInfo || '').trim(),
        }));
        if (l.image) images[l.id] = l.image;
      };
      const rentalIds = new Set<string>();
      listings.forEach((l) => {
        absorbListing(l);
        const family = inventoryFamilyFromListing(l);
        if (family === 'stay') stayIds.add(l.id);
        if (family === 'rental') rentalIds.add(l.id);
      });
      const listingIds = [...new Set(bookingsList.map((b) => b.listing_id))];
      for (const lid of listingIds) {
        if (titles[lid]) continue;
        const listing = await fetchListingById(lid);
        if (gen !== loadGenRef.current) return;
        if (listing) {
          absorbListing(listing);
          const family = inventoryFamilyFromListing(listing);
          if (family === 'stay') stayIds.add(lid);
          if (family === 'rental') rentalIds.add(lid);
        }
      }
      if (gen !== loadGenRef.current) return;
      setStayListingIds(stayIds);
      setRentalListingIds(rentalIds);
      const isTourPickupBooking = (b: (typeof bookingsList)[number]) =>
        partnerBookingIsLiveTrip(b) &&
        !bookingIsStayNight(b) &&
        !bookingIsRental(b) &&
        !stayIds.has(b.listing_id) &&
        !rentalIds.has(b.listing_id);
      setBookings(bookingsList.filter(isTourPickupBooking));
      setListingTitles(titles);
      setMeetingPoints(points);
      setPickupInstructions(instructions);
      setOptionsByListing(optionsMap);
      setPlannerOptions(planner);
      setThumbs(images);
      bookingsLenRef.current = bookingsList.filter(isTourPickupBooking).length;
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(userFacingError(e, USER_ERROR.pickup));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [isSupabase, user?.id]);

  useLayoutEffect(() => {
    const clearPickupPlannerPartnerWorkspace = () => {
      setBookings([]);
      setListingTitles({});
      setMeetingPoints({});
      setPickupInstructions({});
      setOptionsByListing({});
      setPlannerOptions({});
      setThumbs({});
      setStayListingIds(new Set());
      setRentalListingIds(new Set());
      setError(null);
      setSelectedBookingId(null);
    };
    if (!user?.id) {
      pickupPlannerHubUserIdRef.current = null;
      loadGenRef.current += 1;
      clearPickupPlannerPartnerWorkspace();
      setLoading(false);
      return;
    }
    // Phase 1386: clear prior partner pickup workspace before loading the next account (Bookings 1385 / Today 1384 parity).
    if (pickupPlannerHubUserIdRef.current !== user.id) {
      pickupPlannerHubUserIdRef.current = user.id;
      loadGenRef.current += 1;
      clearPickupPlannerPartnerWorkspace();
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('booking');
      setSelectedBookingId(id && id.length > 0 ? id : null);
      const day = (params.get('day') ?? '').trim();
      const scheduleDay = day === 'today' || day === 'tomorrow' ? day : null;
      setDayPreset(scheduleDay);
      const from = (params.get('from') ?? '').trim();
      const to = (params.get('to') ?? '').trim();
      // Absolute from/to only apply when not on an experience-day preset.
      setDateFrom(!scheduleDay && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '');
      setDateTo(!scheduleDay && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : '');
      setListingFilterId((params.get('listing') ?? '').trim());
      setNeedsPickupOnly(params.get('needs') === '1');
      const departure = params.get('departure');
      setDepartureId(departure && departure.length > 0 ? departure : null);
      setShowAllDates(params.get('range') === 'all');
      const query = params.get('q') ?? '';
      if (query) setFilterQuery(query);
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const writePickupFiltersToUrl = useCallback(
    (patch: {
      from?: string;
      to?: string;
      listingId?: string;
      needsOnly?: boolean;
      day?: 'today' | 'tomorrow' | '';
    }) => {
      const day =
        patch.day !== undefined
          ? patch.day === 'today' || patch.day === 'tomorrow'
            ? patch.day
            : null
          : dayPreset;
      const from = day ? '' : patch.from !== undefined ? patch.from : dateFrom;
      const to = day ? '' : patch.to !== undefined ? patch.to : dateTo;
      const listingId = patch.listingId !== undefined ? patch.listingId : listingFilterId;
      const needsOnly = patch.needsOnly !== undefined ? patch.needsOnly : needsPickupOnly;
      if (patch.day !== undefined) setDayPreset(day);
      if (patch.from !== undefined || day) setDateFrom(from);
      if (patch.to !== undefined || day) setDateTo(to);
      if (patch.listingId !== undefined) setListingFilterId(patch.listingId);
      if (patch.needsOnly !== undefined) setNeedsPickupOnly(patch.needsOnly);
      const url = new URL(window.location.href);
      if (!day) url.searchParams.delete('day');
      else url.searchParams.set('day', day);
      if (!from) url.searchParams.delete('from');
      else url.searchParams.set('from', from);
      if (!to) url.searchParams.delete('to');
      else url.searchParams.set('to', to);
      if (!listingId) url.searchParams.delete('listing');
      else url.searchParams.set('listing', listingId);
      if (!needsOnly) url.searchParams.delete('needs');
      else url.searchParams.set('needs', '1');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    },
    [dateFrom, dateTo, dayPreset, listingFilterId, needsPickupOnly]
  );

  const setSelectedBookingAndUrl = useCallback((id: string | null) => {
    setSelectedBookingId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('booking', id);
    else url.searchParams.delete('booking');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  /** Tour pickup work only: hide stays, rentals, cancelled, refunded, and failed checkouts. */
  const filtered = useMemo(() => {
    const nowMs = Date.now();
    return bookings.filter((b) => {
      if (!partnerBookingIsOperatingTrip(b)) return false;
      if (
        bookingIsStayNight(b) ||
        bookingIsRental(b) ||
        stayListingIds.has(b.listing_id) ||
        rentalListingIds.has(b.listing_id)
      ) {
        return false;
      }

      if (dayPreset === 'today') {
        return partnerTourMatchesExperienceDayOffset(b, 0, nowMs);
      }
      if (dayPreset === 'tomorrow') {
        return partnerTourMatchesExperienceDayOffset(b, 1, nowMs);
      }

      const bd = b.booking_date;
      if (dateFrom && bd && bd < dateFrom) return false;
      if (dateTo && bd && bd > dateTo) return false;
      if ((dateFrom || dateTo) && !bd) return false;
      if (!dayPreset && !dateFrom && !dateTo && !showAllDates) {
        if (!bd || bd < toYmd(new Date())) return false;
      }
      return true;
    });
  }, [bookings, dateFrom, dateTo, dayPreset, showAllDates, stayListingIds, rentalListingIds]);

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.created_at.localeCompare(b.created_at)
      ),
    [filtered]
  );

  const pickupCopyFor = useCallback(
    (b: BookingRow) =>
      resolvePartnerPickupCopy({
        purchaseSnapshot: b.purchase_snapshot,
        bookingOptionId: b.booking_option_id,
        specialRequests: b.special_requests,
        listingMeetingPoint: meetingPoints[b.listing_id],
        listingPickupInstructions: pickupInstructions[b.listing_id],
        bookingOptions: isPurchaseSnapshot(b.purchase_snapshot) ? null : optionsByListing[b.listing_id],
      }),
    [meetingPoints, pickupInstructions, optionsByListing]
  );

  const needsPickupInfo = useCallback(
    (b: BookingRow) => {
      const copy = pickupCopyFor(b);
      return bookingNeedsPickupCopy(b, copy.meetingPoint, copy.pickupInstructions);
    },
    [pickupCopyFor]
  );

  const listBookings = useMemo(() => {
    let rows = sorted;
    if (listingFilterId) rows = rows.filter((b) => b.listing_id === listingFilterId);
    if (needsPickupOnly) rows = rows.filter((b) => needsPickupInfo(b));
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((b) => {
        // Phase 1481: search must match purchased titles on cards, not live listing renames.
        // Phase 1485: search must match booking # on cards (Bookings 1484 / admin 1053 parity).
        const title = displayListingTitleFromPurchase(
          b.purchase_snapshot,
          listingTitles[b.listing_id],
          ''
        ).toLowerCase();
        const guestName = (b.guest_name ?? '').toLowerCase();
        const guestEmail = (b.guest_email ?? '').toLowerCase();
        const place = travelerPickupAddressFromRecord({
          snapshot: b.purchase_snapshot,
          specialRequests: b.special_requests,
        }).toLowerCase();
        const draftPlace = (parsePickupDraft(b.special_requests)?.address ?? '').toLowerCase();
        return (
          title.includes(q) ||
          partnerBookingNumberMatchesFilterQuery(q, b.booking_number) ||
          b.id.toLowerCase().includes(q) ||
          guestName.includes(q) ||
          guestEmail.includes(q) ||
          place.includes(q) ||
          draftPlace.includes(q)
        );
      });
    }
    const cmp = (a: BookingRow, b: BookingRow) =>
      (a.booking_date ?? '').localeCompare(b.booking_date ?? '') || a.created_at.localeCompare(b.created_at);
    return sortDate === 'asc' ? [...rows].sort(cmp) : [...rows].sort((a, b) => cmp(b, a));
  }, [sorted, listingFilterId, needsPickupOnly, sortDate, needsPickupInfo, filterQuery, listingTitles]);

  // Reset day page when the filtered date set changes shape.
  useEffect(() => {
    setDayPage(1);
  }, [listingFilterId, needsPickupOnly, filterQuery, dateFrom, dateTo, dayPreset, showAllDates]);

  const listingSelectOptions = useMemo(
    () =>
      Object.entries(listingTitles)
        .filter(([id]) => !stayListingIds.has(id))
        .map(([id, title]) => ({
          id,
          title: partnerListingFilterLabelFromBookings(id, title, bookings),
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [listingTitles, stayListingIds, bookings]
  );

  const exportCsv = async () => {
    // Phase 1763/1768: guest-PII pickup export for editors + finance (+ audit insert).
    if (!canExportPickupCsv || !user?.id) return;
    const rows = listBookings.map((b) => {
      const copy = pickupCopyFor(b);
      const meetingFulfillment = displayFulfillmentFromPurchase(b.purchase_snapshot) === 'meeting_point';
      const pickupOrMeetingHm = meetingFulfillment
        ? effectiveMeetingTimeHm(b) || ''
        : b.pickup_time
          ? pgTimeToHm(b.pickup_time) ?? ''
          : '';
      return partnerPickupCsvValues(
        b,
        displayListingTitleFromPurchase(b.purchase_snapshot, listingTitles[b.listing_id], ''),
        b.start_time ? pgTimeToHm(b.start_time) ?? '' : '',
        pickupOrMeetingHm,
        copy.meetingPoint,
        copy.pickupInstructions
      )
        .map(csvSafeCell)
        .join(',');
    });
    const csv = [PARTNER_PICKUP_CSV_HEADER.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pickup-planner-${toYmd(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // Phase 1791: await audit — silent void hid RLS/network failures after download.
    const audited = await insertSupplierExportRun({
      supplierId: user.id,
      actorId: user.id,
      kind: 'bookings',
      format: 'csv',
      scope: 'filtered',
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      rowCount: listBookings.length,
      // Phase 1784: record the exact Pickup filter slice that produced guest-PII rows.
      filtersSnapshot: {
        surface: 'pickup',
        dayPreset,
        listingId: listingFilterId || null,
        needsPickupOnly,
        query: filterQuery.trim() || null,
        rowCount: listBookings.length,
      },
    });
    if (!audited) {
      setError('Export downloaded, but the audit log failed. Try again or contact support.');
    }
  };

  const plannerStats = useMemo(() => {
    const guestTotal = listBookings.reduce((sum, b) => sum + Number(b.guests ?? 0), 0);
    const needsPickup = listBookings.filter((b) => needsPickupInfo(b)).length;
    return { bookings: listBookings.length, guests: guestTotal, needsPickup };
  }, [listBookings, needsPickupInfo]);
  const setDepartureAndUrl = (id: string | null) => {
    setDepartureId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('departure', id);
    else {
      url.searchParams.delete('departure');
      url.searchParams.delete('booking');
      setSelectedBookingId(null);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const setShowAllDatesAndUrl = (all: boolean) => {
    setShowAllDates(all);
    const url = new URL(window.location.href);
    if (all) url.searchParams.set('range', 'all');
    else url.searchParams.delete('range');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const applyPickupSave = (
    bookingId: string,
    res: { special_requests?: string; pickup_time?: string | null }
  ) => {
    setBookings((prev) =>
      prev.map((row) =>
        row.id === bookingId
          ? {
              ...row,
              special_requests: res.special_requests ?? row.special_requests,
              pickup_time: res.pickup_time === undefined ? row.pickup_time : res.pickup_time,
            }
          : row
      )
    );
  };

  const saveOnePickup = async (bookingId: string, input: SaveSupplierPickupInput) => {
    const res = await saveSupplierPickupDetails(bookingId, input);
    if (res.ok) applyPickupSave(bookingId, res);
    return res;
  };

  const saveStopTime = async (bookingIds: string[], timeHm: string, notify: boolean) => {
    let notifyError: string | null = null;
    for (const bookingId of bookingIds) {
      const booking = bookings.find((row) => row.id === bookingId);
      if (!booking) continue;
      const draft = parsePickupDraft(booking.special_requests);
      const address =
        draft?.address ||
        travelerPickupAddressFromRecord({
          snapshot: booking.purchase_snapshot,
          specialRequests: booking.special_requests,
        });
      const res = await saveSupplierPickupDetails(bookingId, {
        notify,
        pickupTimeHm: timeHm,
        address,
        placeId: draft?.placeId ?? null,
        lat: draft?.lat ?? null,
        lng: draft?.lng ?? null,
        instructions:
          draft?.instructions ||
          parseBookingPickupInstructionsOverride(booking.special_requests) ||
          '',
        meetingPointOnly: displayFulfillmentFromPurchase(booking.purchase_snapshot) === 'meeting_point',
      });
      if (!res.ok) return res;
      applyPickupSave(bookingId, res);
      if (res.notifyError) notifyError = res.notifyError;
    }
    return { ok: true, notified: notify && !notifyError, notifyError };
  };

  const printDeparture = () => {
    const rows = listBookings.filter((row) => pickupDepartureKey(row) === departureId);
    if (rows.length === 0) return;
    const sample = rows[0];
    const title = displayListingTitleFromPurchase(sample.purchase_snapshot, listingTitles[sample.listing_id], 'Experience');
    const option = displayOptionLabelFromPurchase(sample.purchase_snapshot, null) || '';
    const body = rows
      .map((row) => {
        const copy = pickupCopyFor(row);
        const phone = (row.special_requests ?? '').match(/^Guest phone:\s*(.+)$/im)?.[1]?.trim() || '';
        const ref = travelerPublicBookingReference(row.public_reference) || (typeof row.booking_number === 'number' ? `#${row.booking_number}` : row.id);
        const timeHm =
          displayFulfillmentFromPurchase(row.purchase_snapshot) === 'meeting_point'
            ? effectiveMeetingTimeHm(row) || ''
            : row.pickup_time
              ? pgTimeToHm(row.pickup_time) ?? ''
              : '';
        return `<tr><td>${ref}</td><td>${row.guest_name ?? ''}</td><td>${row.guests ?? ''}</td><td>${travelerPickupAddressFromRecord({ snapshot: row.purchase_snapshot, specialRequests: row.special_requests })}</td><td>${timeHm}</td><td>${phone}</td><td>${copy.pickupInstructions}</td></tr>`;
      })
      .join('');
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    popup.document.write(`<!doctype html><title>${title} manifest</title><style>body{font:13px sans-serif;color:#18181b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e5e7eb;padding:6px;text-align:left}</style><h1>${title}</h1><p>${option} · ${sample.booking_date ?? ''} · ${sample.purchase_snapshot && typeof sample.purchase_snapshot === 'object' && 'startTimeHm' in sample.purchase_snapshot ? String((sample.purchase_snapshot as { startTimeHm?: string }).startTimeHm ?? '') : ''}</p><table><thead><tr><th>Reference</th><th>Traveler</th><th>Guests</th><th>Pickup location</th><th>Pickup time</th><th>Phone</th><th>Instructions</th></tr></thead><tbody>${body}</tbody></table>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  if (!user) return null;

  const filtersOn = Boolean(dateFrom || dateTo || dayPreset || listingFilterId || needsPickupOnly || filterQuery.trim() || showAllDates);
  const activeBookingsCount = bookings.filter((b) => partnerBookingIsOperatingTrip(b)).length;
  const departureCount = new Set(listBookings.map((row) => pickupDepartureKey(row))).size;
  const departureRows = departureId ? listBookings.filter((row) => pickupDepartureKey(row) === departureId) : [];
  const editorListingId = departureRows[0]?.listing_id ?? listBookings[0]?.listing_id ?? '';
  const listingActions = editorListingId ? (
    <div className="flex gap-3">
      {/* Phase 1756: listing logistics stay in the editor. */}
      <button type="button" className="text-[12px] font-semibold text-[#073b83] disabled:opacity-40" disabled={!canEditBookings} onClick={() => openSupplierListingEditor(editorListingId, 'meeting')}>
        Edit meeting
      </button>
      <button type="button" className="text-[12px] font-semibold text-[#073b83] disabled:opacity-40" disabled={!canEditBookings} onClick={() => openSupplierListingEditor(editorListingId, 'pickup')}>
        Edit pickup
      </button>
    </div>
  ) : null;
  const rangeActive = !showAllDates && !dateFrom && !dateTo && !dayPreset;

  return (
    <div className={`${SUPPLIER_PAGE_CLASS} tv-pickup-page font-sans`}>
      {departureId ? null : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-sans text-lg font-bold tracking-tight text-[#18181b]">Pickups</h1>
              <p className="truncate text-[12px] text-[#71717a]">
                {departureCount} departures · {listBookings.length} bookings · {plannerStats.guests} guests
                {plannerStats.needsPickup > 0 ? ` · ${plannerStats.needsPickup} missing pickup details` : ''}
              </p>
            </div>
            <button type="button" className="tv-btn-secondary h-9 shrink-0 px-2.5 text-[13px]" disabled={!canExportPickupCsv} onClick={() => void exportCsv()}>
              <Download className="mr-1 h-4 w-4" aria-hidden />
              Export
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${rangeActive ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`} onClick={() => { writePickupFiltersToUrl({ from: '', to: '', day: '' }); setShowAllDatesAndUrl(false); }}>
              Upcoming
            </button>
            <button type="button" className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${showAllDates ? 'bg-[#f0f4fa] text-[#073b83]' : 'text-[#52525b]'}`} onClick={() => setShowAllDatesAndUrl(!showAllDates)}>
              All dates
            </button>
          </div>

          <div className="tv-pickup-toolbar">
            <div className="tv-pickup-range" role="group" aria-label="Date range">
              <input type="date" className="tv-input" value={dateFrom} aria-label="From" onChange={(e) => writePickupFiltersToUrl({ from: e.target.value, day: '' })} />
              <span className="text-[#a1a1aa]" aria-hidden>–</span>
              <input type="date" className="tv-input" value={dateTo} aria-label="To" onChange={(e) => writePickupFiltersToUrl({ to: e.target.value, day: '' })} />
            </div>
            <select
              className="tv-input"
              aria-label="Experience"
              value={listingFilterId}
              onChange={(e) => writePickupFiltersToUrl({ listingId: e.target.value })}
            >
              <option value="">All experiences</option>
              {listingSelectOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.title}</option>
              ))}
            </select>
            <input
              type="search"
              className="tv-input"
              placeholder="Guest, reference, experience"
              value={filterQuery}
              aria-label="Search pickups"
              onChange={(e) => setFilterQuery(e.target.value)}
            />
            <button
              type="button"
              className={`h-10 shrink-0 rounded-md border px-3 text-[13px] font-semibold ${needsPickupOnly ? 'border-[#073b83] bg-[#f0f4fa] text-[#073b83]' : 'border-[#e5e7eb] bg-white text-[#52525b]'}`}
              onClick={() => writePickupFiltersToUrl({ needsOnly: !needsPickupOnly })}
            >
              Needs attention
            </button>
          </div>
          {/* Phase 1483: listing options use partnerListingFilterLabelFromBookings. */}
        </>
      )}

      {error ? <ErrorState title="Pickups unavailable" body={error} retry={{ onClick: () => void load() }} /> : null}
      {loading && bookings.length === 0 ? <SupplierListSkeleton rows={4} /> : null}

      {!loading && activeBookingsCount === 0 ? (
        <SupplierEmptyState
          icon={CalendarDays}
          title="No bookings yet"
          body="When a traveler pays for a tour, their pickup appears here."
          action={
            <div className="flex flex-wrap gap-2">
              {/* Phase 1651 */}
              <button type="button" className="tv-btn-primary" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/bookings`)}>
                Open bookings
              </button>
              <button type="button" className="tv-btn-ghost" onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/listings`)}>
                Your listings
              </button>
            </div>
          }
        />
      ) : null}

      {filtersOn && listBookings.length === 0 && activeBookingsCount > 0 && !departureId ? (
        <p className="text-sm text-[#52525b]">No departures match these filters.</p>
      ) : (
        <PickupPlannerWorkspace
          bookings={listBookings}
          titles={listingTitles}
          thumbs={thumbs}
          optionsByListing={plannerOptions}
          meetingPoints={meetingPoints}
          departureId={departureId}
          manageId={selectedBookingId}
          canEdit={canEditBookings}
          page={dayPage}
          onPageChange={setDayPage}
          onOpenDeparture={setDepartureAndUrl}
          onBack={() => setDepartureAndUrl(null)}
          onManage={setSelectedBookingAndUrl}
          onMessage={(id) => openSupplierInbox(id)}
          onSave={saveOnePickup}
          onSaveMany={saveStopTime}
          onExport={() => void exportCsv()}
          exportDisabled={!canExportPickupCsv}
          onPrint={departureId ? printDeparture : undefined}
          listingActions={listingActions}
        />
      )}
    </div>
  );
}
