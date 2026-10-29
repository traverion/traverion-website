// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { effectiveBookingCutoffHours, listingHasUpcomingBookableSeason, quoteListingBooking, resolveTourDepartureHmForCutoff, stayCheckoutNightsAlreadyBooked, stayNightIsOperatorBlocked, stayRangeFromBooking, tourDepartureRemainingSeats, tourDepartureSlotCapacity, type DiscountRow, type ListingQuoteRow, type StayCheckoutOccupancyRow } from '../_shared/booking-quote.ts';
import {
  departureHasConfirmedPaidBooking,
  evaluateDepartureBookingWindow,
  lastMinutePolicyFromListingExtras,
} from '../_shared/last-minute-booking.ts';
import { resolveDepartureTimezone } from '../_shared/tour-departure-cutoff.ts';
import {
  checkoutHoldExpiresAtUnix,
  tourCheckoutOccupiedGuests,
  inventoryStartTimeHmFromBooking,
  type TourCheckoutOccupancyRow,
} from '../_shared/booking-hold.ts';
import { stayBookingMethodFromListingExtras } from '../_shared/stay-booking-method.ts';
import { checkoutPaymentStatusCanResume, resumeStayCheckoutDate, checkoutResumeLostRaceToPaid, resumeListingIdMismatch, resumeStoredOptionId, participantMixFromGuestBreakdown } from '../_shared/checkout-resume.ts';
import { resumeStayLeadGuestName, stayCheckoutLeadGuestNameReady, stayBookingColumnsForCheckoutUpdate } from '../_shared/stay-checkout-guest.ts';
import { readStayGuestParty } from '../_shared/stay-guest-party.ts';
import { freezeStayBookingPrice, readStayExtraSelection } from '../_shared/stay-price.ts';
import {
  buildPurchaseSnapshot,
  resolveMeetingPointForSnapshot,
  resolveOptionFieldsForSnapshot,
  resolvePickupInstructionsForSnapshot,
  resolveStayFieldsForSnapshot,
  normalizePurchaseStringList,
  mergePurchaseSnapshotMaxCheckOut,
} from '../_shared/purchase-snapshot.ts';
import { resolveStayCancellationForSnapshot } from '../_shared/stay-cancellation-preset.ts';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from '../_shared/stripe-test-only.ts';
import {
  checkoutEnvironmentMetadata,
  resolveExpectedTraverionProjectRef,
} from '../_shared/stripe-environment-guard.ts';
import { authUserVerifiedEmail } from '../_shared/auth-verified-email.ts';
import { resolveCheckoutSiteUrl } from '../_shared/checkout-return-origin.ts';
import { isMissingPostgresFunctionError } from '../_shared/checkout-inventory-conflict.ts';
import {
  travelerCheckoutIdentitySyncPatch,
  travelerOwnsCheckoutBooking,
} from '../_shared/booking-traveler-ownership.ts';
import { buildCheckoutClaimSpecialRequests } from '../_shared/booking-notes.ts';
import {
  notesWithoutPlaceOfStay,
  notesWithVerifiedPickup,
  parseTravelerPickupPoint,
  pickupAreaFromOption,
  travelerPickupAllowed,
} from '../_shared/pickup-area.ts';
import { createCheckoutTiming } from '../_shared/checkout-initiation-timing.ts';
import { quoteRentalCheckoutLine } from '../_shared/rental-checkout-quote.ts';
import { rentalDraftCheckoutAllowed } from '../_shared/rental-checkout-listing-gate.ts';
import {
  authoritativeRentalWindow,
  isReservedRentalPreviewId,
} from '../_shared/rental-server-window.ts';
import { fromMinorUnits } from '../_shared/commercial-money.ts';

type RequestBody = {
  bookingId?: string;
  listingId?: string;
  listingTitle?: string;
  bookingDate?: string;
  guests?: number;
  customerName?: string;
  customerPhone?: string;
  specialRequests?: string;
  travelerPickup?: unknown;
  /** Ignored for pricing. Kept so old clients do not break; server recomputes. */
  totalAmount?: number;
  /**
   * Optional client-shown total (major units). When set, must match the server quote
   * in integer minor units or checkout is refused (409) — never silently charge a different amount.
   */
  expectedTotal?: number;
  currency?: string;
  bookingOptionId?: string;
  checkoutDate?: string;
  successPath?: string;
  cancelPath?: string;
  /** Browser origin (e.g. http://127.0.0.1:5173). Allowlisted only. */
  returnOrigin?: string;
  participantMix?: Record<string, number>;
  guestBreakdown?: unknown;
  stayParty?: unknown;
  stayExtras?: unknown;
  /** Must be true for new checkout holds; resume by bookingId may omit. */
  checkoutConsentAccepted?: boolean;
  /** Read-only probe. Does not create a booking or a charge. */
  intent?: string;
  /** Rental interval checkout (ignored unless listing inventoryFamily=rental). */
  rental?: {
    variantId?: string;
    quantity?: number;
    pickupAt?: string;
    returnAt?: string;
    durationCount?: number;
    durationUnit?: 'hour' | 'day';
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function sanitizePath(path: string | undefined, fallback: string): string {
  const raw = (path ?? '').trim();
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (raw.startsWith('/\\')) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.slice(1))) return fallback;
  return raw;
}

const BOOKING_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Trips cancel return must identify which hold was abandoned (multi-pending). */
function appendBookingParam(path: string, bookingId: string): string {
  const id = String(bookingId ?? '').trim();
  if (!id || !BOOKING_UUID_RE.test(id)) return path;
  if (/[?&]booking=/i.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}booking=${encodeURIComponent(id)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  let preBody: { intent?: string } = {};
  try {
    preBody = await req.json();
  } catch {
    preBody = {};
  }
  if (preBody.intent === 'rental_checkout_capability') {
    const rentalCheckoutEnabled = (Deno.env.get('RENTAL_CHECKOUT_ENABLED') ?? '').trim() === '1';
    return json({ success: true, rentalCheckoutEnabled });
  }

  try {
    const timing = createCheckoutTiming();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const publicSiteUrlEnv = (Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    const extraReturnOrigins = (Deno.env.get('CHECKOUT_RETURN_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json({ success: false, error: 'Supabase env missing' }, 500);
    }
    if (!stripeSecret) return json({ success: false, error: 'STRIPE_SECRET_KEY not configured' }, 500);
    if (!isStripeTestSecretKey(stripeSecret)) {
      return json({ success: false, error: stripeLiveSecretBlockedMessage() }, 503);
    }
    const envStamp = checkoutEnvironmentMetadata(
      resolveExpectedTraverionProjectRef({
        traverionSupabaseProjectRef: Deno.env.get('TRAVERION_SUPABASE_PROJECT_REF'),
        supabaseUrl,
      })
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ success: false, error: 'Missing Authorization header' }, 401);

    const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Body already parsed for the capability probe; keep Promise.all so auth stays
    // explicit and stay/rental speed certs can assert the parallel shape.
    const [authResult, body] = await Promise.all([
      authedClient.auth.getUser(),
      Promise.resolve(preBody as Partial<RequestBody>),
    ]);
    timing.mark('authAndBodyMs');
    const { data: authData, error: authError } = authResult;
    if (authError || !authData?.user) {
      return json({ success: false, error: 'Unauthorized', timings: timing.snapshot() }, 401);
    }
    const user = authData.user;
    const email = authUserVerifiedEmail(user);
    if (!email) {
      return json(
        {
          success: false,
          error: 'Confirm your email before checkout. Check your inbox for a confirmation link.',
          timings: timing.snapshot(),
        },
        403
      );
    }
    const bookingId = String(body.bookingId ?? '').trim();
    const isResumeOnly = Boolean(bookingId) && !String(body.listingId ?? '').trim();
    if (!isResumeOnly && body.checkoutConsentAccepted !== true) {
      return json(
        {
          success: false,
          error: 'Accept the cancellation policy and Terms of Service before checkout.',
        },
        400
      );
    }
    const termsAcceptedAt = new Date().toISOString();
    let listingId = String(body.listingId ?? '').trim();
    let listingTitle = String(body.listingTitle ?? 'Experience').trim() || 'Experience';
    let bookingDate = String(body.bookingDate ?? '').trim();
    let guests = Number(body.guests ?? 0);
    const customerName = String(body.customerName ?? '').trim();
    const customerPhone = String(body.customerPhone ?? '').trim();
    const specialRequests = String(body.specialRequests ?? '').trim();
    const requestedOptionId = String(body.bookingOptionId ?? '').trim();
    const startTimeRaw = String((body as { startTime?: unknown }).startTime ?? '').trim();
    let startTime = /^\d{1,2}:\d{2}$/.test(startTimeRaw)
      ? startTimeRaw.padStart(5, '0')
      : '';
    let checkoutDate = String(body.checkoutDate ?? '').trim();
    const successPath = sanitizePath(body.successPath, '/booking-confirmed');
    const cancelPath = sanitizePath(body.cancelPath, '/cart?payment=cancelled');
    const publicSiteUrl = resolveCheckoutSiteUrl({
      publicSiteUrl: publicSiteUrlEnv,
      returnOrigin: typeof body.returnOrigin === 'string' ? body.returnOrigin : null,
      extraAllowedOrigins: extraReturnOrigins,
    });
    let participantMix =
      body.participantMix && typeof body.participantMix === 'object' && !Array.isArray(body.participantMix)
        ? (body.participantMix as Record<string, number>)
        : null;

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    let targetBookingId = bookingId;
    let storedOptionId: string | null = requestedOptionId || null;
    let resumeStayCheckOut: string | null = null;
    let resumeStayNights: number | null = null;
    let resumeStayNotes: string | null = null;
    let resumePurchaseSnapshot: unknown = null;
    let resumeGuestName: string | null = null;
    let priorCheckoutSessionId: string | null = null;
    let resumeQuoteSync: {
      totalAmount: number;
      currency: string;
      guestName: string | null;
      optionId: string | null;
      holdExpiresAtIso: string;
    } | null = null;

    if (targetBookingId) {
      const withOption = await admin
        .from('bookings')
        .select(
          'id, listing_id, guest_email, guest_user_id, guest_name, guests, guest_breakdown, booking_date, check_out, nights, status, payment_status, total_amount, currency, special_requests, booking_option_id, checkout_session_id, start_time, purchase_snapshot'
        )
        .eq('id', targetBookingId)
        .maybeSingle();
      let row = withOption.data as Record<string, unknown> | null;
      if (withOption.error || !row) {
        const fallback = await admin
          .from('bookings')
          .select(
            'id, listing_id, guest_email, guest_user_id, guest_name, guests, guest_breakdown, booking_date, status, payment_status, total_amount, currency, special_requests, checkout_session_id, start_time'
          )
          .eq('id', targetBookingId)
          .maybeSingle();
        if (fallback.error) return json({ success: false, error: fallback.error.message }, 500);
        row = fallback.data as Record<string, unknown> | null;
      }
      if (!row) return json({ success: false, error: 'Booking not found' }, 404);
      if (
        !travelerOwnsCheckoutBooking({
          authUserId: user.id,
          verifiedEmail: email,
          guestUserId: typeof row.guest_user_id === 'string' ? row.guest_user_id : null,
          guestEmail: typeof row.guest_email === 'string' ? row.guest_email : null,
        })
      ) {
        return json({ success: false, error: 'You can only pay your own booking' }, 403);
      }
      // Phase 1505: resume must not accept a client listingId that disagrees with the row.
      if (
        resumeListingIdMismatch({
          bodyListingId: listingId,
          bookingListingId: typeof row.listing_id === 'string' ? row.listing_id : null,
        })
      ) {
        return json(
          { success: false, error: 'This payment link does not match the booking.' },
          400
        );
      }
      if (email) {
        const syncPatch = travelerCheckoutIdentitySyncPatch({
          authUserId: user.id,
          verifiedEmail: email,
          guestUserId: typeof row.guest_user_id === 'string' ? row.guest_user_id : null,
          guestEmail: typeof row.guest_email === 'string' ? row.guest_email : null,
        });
        if (syncPatch) {
          const { error: syncErr } = await admin
            .from('bookings')
            .update(syncPatch)
            .eq('id', targetBookingId);
          if (syncErr) return json({ success: false, error: syncErr.message }, 500);
        }
      }
      if (row.status !== 'pending') {
        return json({ success: false, error: 'Only pending bookings can be paid' }, 400);
      }
      if ((row.payment_status ?? 'pending') === 'paid') {
        return json({ success: false, error: 'This booking is already paid' }, 400);
      }
      if (!checkoutPaymentStatusCanResume(row.payment_status)) {
        return json({ success: false, error: 'This booking cannot be paid' }, 400);
      }
      listingId = String(row.listing_id ?? '').trim();
      bookingDate = String(row.booking_date ?? '').trim();
      guests = Number(row.guests ?? 0);
      resumeStayCheckOut = typeof row.check_out === 'string' ? row.check_out.trim() : null;
      const nightsRaw = Number(row.nights ?? NaN);
      resumeStayNights = Number.isFinite(nightsRaw) && nightsRaw >= 1 ? Math.floor(nightsRaw) : null;
      resumeStayNotes = typeof row.special_requests === 'string' ? row.special_requests : null;
      resumePurchaseSnapshot = row.purchase_snapshot ?? null;
      resumeGuestName = typeof row.guest_name === 'string' ? row.guest_name.trim() : null;
      priorCheckoutSessionId =
        typeof row.checkout_session_id === 'string' && row.checkout_session_id.trim()
          ? row.checkout_session_id.trim()
          : null;
      // Phase 1501/1536: Pay now resume must not accept client option/slot/nights.
      // Column + purchase_snapshot.optionId only — never body or notes-planted keys.
      storedOptionId = resumeStoredOptionId({
        bookingOptionId: (row as { booking_option_id?: string }).booking_option_id,
        purchaseSnapshot: row.purchase_snapshot,
      });
      // Sold seat = purchase_snapshot.startTimeHm, else bookings.start_time (Phase 1080).
      // Ignore body startTime on resume so travelers cannot migrate the hold to another departure.
      {
        const purchased = inventoryStartTimeHmFromBooking({
          start_time: typeof row.start_time === 'string' ? row.start_time : null,
          purchase_snapshot: row.purchase_snapshot,
        });
        startTime = purchased || '';
      }
      // Drop client participant mix — rebuild from frozen guest_breakdown so
      // age_dependent Pay-now resume can re-quote without trusting the body.
      participantMix = participantMixFromGuestBreakdown(row.guest_breakdown);
    } else {
      if (!listingId) return json({ success: false, error: 'listingId is required' }, 400);
      const rentalIntent = body.rental && typeof body.rental === 'object';
      if (rentalIntent) {
        // Rental checkout uses pickup/return instants; seed bookingDate/guests after quote.
        const pickupRaw = String(body.rental?.pickupAt ?? '').trim();
        const pickupMs = Date.parse(pickupRaw);
        if (!Number.isNaN(pickupMs)) {
          bookingDate = new Date(pickupMs).toISOString().slice(0, 10);
        }
        const qty = Number(body.rental?.quantity ?? guests);
        if (Number.isFinite(qty) && qty >= 1) guests = Math.floor(qty);
      } else {
        if (!bookingDate || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
          return json({ success: false, error: 'bookingDate must be YYYY-MM-DD' }, 400);
        }
        {
          const [y, m, d] = bookingDate.split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d));
          if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
            return json({ success: false, error: 'bookingDate must be a real calendar date' }, 400);
          }
        }
        if (!Number.isFinite(guests) || guests < 1 || guests > 99) {
          return json({ success: false, error: 'guests must be between 1 and 99' }, 400);
        }
      }
    }

    const { data: listingRow, error: listingError } = await admin
      .from('listings')
      .select(
        'id, title, status, price_starting_from, price_currency, listing_extras, group_size, meeting_point, pickup_instructions, cancellation_policy, includes, excludes, supplier_id'
      )
      .eq('id', listingId)
      .maybeSingle();
    if (listingError) return json({ success: false, error: listingError.message }, 500);
    if (!listingRow) return json({ success: false, error: 'Listing not found' }, 404);
    const listingStatus = String(listingRow.status ?? '').trim();
    const earlyFamily =
      listingRow.listing_extras && typeof listingRow.listing_extras === 'object'
        ? (listingRow.listing_extras as { inventoryFamily?: unknown }).inventoryFamily
        : null;
    const rentalCheckoutEnabledEarly =
      (Deno.env.get('RENTAL_CHECKOUT_ENABLED') ?? '').trim() === '1';
    // Phase 583: a falsy status (null/undefined/'') must never be
    // treated as bookable -- see src/lib/booking-quote.ts's
    // isListingBookable for the full explanation (migration-082
    // verification bypass).
    // Published rentals book normally. Draft rental checkout is allowed only when
    // RENTAL_CHECKOUT_ENABLED=1 (capability probe / emergency kill-switch).
    if (
      listingStatus !== 'published' &&
      !rentalDraftCheckoutAllowed({
        inventoryFamily: typeof earlyFamily === 'string' ? earlyFamily : null,
        listingStatus,
        rentalCheckoutEnabled: rentalCheckoutEnabledEarly,
      })
    ) {
      return json({ success: false, error: 'This listing is not available to book.' }, 400);
    }
    const listingSupplierId = String(listingRow.supplier_id ?? '').trim();
    if (listingSupplierId && listingSupplierId === user.id) {
      return json({ success: false, error: 'You cannot book your own listing.' }, 403);
    }
    const isRentalListing = earlyFamily === 'rental';
    // Phase 1278: season-ended tours must not reach Stripe (catalog/PDP parity).
    // Rentals do not use tour bookingOptions / seasons — skip this gate.
    if (!isRentalListing && !listingHasUpcomingBookableSeason(listingRow.listing_extras)) {
      return json({ success: false, error: 'This listing is not available to book.' }, 400);
    }
    // Phase 1146: hosts/team must not hold/pay their own inventory (reviews already blocked).
    // Rental path runs the team check in parallel with commercial terms below.
    if (!isRentalListing && listingSupplierId) {
      const { data: teamSelf, error: teamSelfErr } = await admin
        .from('supplier_team_members')
        .select('user_id')
        .eq('supplier_id', listingSupplierId)
        .eq('user_id', user.id)
        .maybeSingle();
      // Phase 1308: team check failure ≠ “not a team member” (client 1307 parity).
      if (teamSelfErr) {
        return json({ success: false, error: 'Could not verify booking eligibility. Try again.' }, 500);
      }
      if (teamSelf?.user_id) {
        return json({ success: false, error: 'You cannot book a listing for your supplier account.' }, 403);
      }
    }
    if (listingRow.title?.trim()) listingTitle = listingRow.title.trim();
    timing.mark('listingLoadedMs');

    const listing: ListingQuoteRow = {
      status: listingRow.status ?? null,
      price_starting_from: Number(listingRow.price_starting_from ?? 0),
      price_currency: listingRow.price_currency ?? 'USD',
      listing_extras: listingRow.listing_extras,
      group_size: listingRow.group_size ?? null,
      title: listingRow.title,
    };
    let discounts: DiscountRow[] = [];
    // Rentals: skip tour/stay expire_stale_checkout_holds + listing_discounts.
    // claim_rental_inventory_hold already expires stale rental holds; rental quotes
    // do not use listing_discounts.
    if (!isRentalListing) {
      const discountSelect =
        'id, type, value, valid_from, valid_until, booking_option_id, book_from, book_until, activity_from, activity_until, paused, booking_limit, deleted_at';
      // Expire stale Instant Book rows + load discounts in parallel (independent).
      const [, discountFirst] = await Promise.all([
        admin.rpc('expire_stale_checkout_holds', { p_listing_id: listingId }),
        admin.from('listing_discounts').select(discountSelect).eq('listing_id', listingId),
      ]);
      let discountResult = discountFirst;
      if (discountResult.error && /book_from|paused|deleted_at|booking_limit/i.test(discountResult.error.message)) {
        discountResult = await admin
          .from('listing_discounts')
          .select('type, value, valid_from, valid_until, booking_option_id')
          .eq('listing_id', listingId);
      }
      timing.mark('expireAndDiscountsMs');
      const { data: discountRows, error: discountError } = discountResult;
      // Fail closed: never quote full price because discount rows failed to load (Phase 1088).
      if (discountError) {
        return json({ success: false, error: 'Could not load offers for this listing. Try again.' }, 500);
      }
      discounts = (discountRows ?? []) as DiscountRow[];
      const limitedIds = discounts
        .filter((d) => d.id && d.booking_limit != null && d.booking_limit > 0 && !d.deleted_at && !d.paused)
        .map((d) => d.id as string);
      if (limitedIds.length > 0) {
        const redemptionLookup = await admin
          .from('bookings')
          .select('id, applied_discount_id, status, payment_status, hold_expires_at')
          .eq('listing_id', listingId)
          .in('applied_discount_id', limitedIds);
        if (redemptionLookup.error && !/applied_discount_id/i.test(redemptionLookup.error.message)) {
          return json({ success: false, error: 'Could not load offers for this listing. Try again.' }, 500);
        }
        const counts = new Map<string, number>();
        const nowMs = Date.now();
        for (const row of redemptionLookup.data ?? []) {
          if (targetBookingId && row.id === targetBookingId) continue;
          if ((row.status ?? '') === 'cancelled') continue;
          const paid = row.payment_status === 'paid' || row.payment_status === 'authorized';
          const held =
            row.payment_status === 'pending' &&
            row.hold_expires_at != null &&
            new Date(row.hold_expires_at).getTime() > nowMs;
          if (!paid && !held) continue;
          const offerId = String(row.applied_discount_id ?? '');
          if (!offerId) continue;
          counts.set(offerId, (counts.get(offerId) ?? 0) + 1);
        }
        for (const row of discounts) {
          if (row.id) row.redeemed_count = counts.get(row.id) ?? 0;
        }
      }
    } else {
      timing.mark('expireAndDiscountsMs');
    }

    const extrasFamily =
      listingRow.listing_extras && typeof listingRow.listing_extras === 'object'
        ? (listingRow.listing_extras as { inventoryFamily?: unknown }).inventoryFamily
        : null;
    if (body.rental && typeof body.rental === 'object' && extrasFamily !== 'rental') {
      return json(
        { success: false, error: 'Rental checkout fields do not apply to this listing.' },
        400
      );
    }
    // Rentals: claim + Stripe path exists behind RENTAL_CHECKOUT_ENABLED.
    // Public publish remains blocked by mig 282 until explicit release approval.
    if (extrasFamily === 'rental') {
      if (isReservedRentalPreviewId(listingId)) {
        return json({ success: false, error: 'Development preview rentals cannot be booked.' }, 400);
      }
      const rentalCheckoutEnabled = (Deno.env.get('RENTAL_CHECKOUT_ENABLED') ?? '').trim() === '1';
      if (!rentalCheckoutEnabled) {
        return json(
          {
            success: false,
            error:
              'Rental checkout is not available yet. Traverion Rentals remains in controlled rollout.',
          },
          503
        );
      }

      const rentalBody = body.rental ?? {};
      const resumeSnap =
        resumePurchaseSnapshot && typeof resumePurchaseSnapshot === 'object'
          ? (resumePurchaseSnapshot as Record<string, unknown>)
          : null;
      const variantId = String(
        rentalBody.variantId ??
          storedOptionId ??
          (typeof resumeSnap?.variantId === 'string' ? resumeSnap.variantId : '')
      ).trim();
      const quantity = Number(
        rentalBody.quantity ??
          guests ??
          (typeof resumeSnap?.quantity === 'number' ? resumeSnap.quantity : NaN)
      );
      const pickupAt = String(
        rentalBody.pickupAt ?? (typeof resumeSnap?.pickupAt === 'string' ? resumeSnap.pickupAt : '')
      ).trim();
      const returnAt = String(
        rentalBody.returnAt ?? (typeof resumeSnap?.returnAt === 'string' ? resumeSnap.returnAt : '')
      ).trim();
      const durationUnitRaw =
        rentalBody.durationUnit ??
        (resumeSnap?.durationUnit === 'hour' || resumeSnap?.durationUnit === 'day'
          ? resumeSnap.durationUnit
          : null);
      const durationUnit =
        durationUnitRaw === 'hour' || durationUnitRaw === 'day' ? durationUnitRaw : null;
      const durationCount = Number(
        rentalBody.durationCount ??
          (typeof resumeSnap?.durationCount === 'number' ? resumeSnap.durationCount : NaN)
      );
      if (!variantId) return json({ success: false, error: 'Choose a rental option.' }, 400);
      if (!pickupAt || !returnAt || Number.isNaN(Date.parse(pickupAt)) || Number.isNaN(Date.parse(returnAt))) {
        return json({ success: false, error: 'Choose valid pickup and return times.' }, 400);
      }
      if (Date.parse(returnAt) <= Date.parse(pickupAt)) {
        return json({ success: false, error: 'Return must be after pickup.' }, 400);
      }
      if (!durationUnit || !(durationCount > 0)) {
        return json({ success: false, error: 'Choose a valid rental duration.' }, 400);
      }

      const listingExtrasObj =
        listingRow.listing_extras && typeof listingRow.listing_extras === 'object'
          ? (listingRow.listing_extras as Record<string, unknown>)
          : {};
      const rentalExtras = listingExtrasObj.rental;
      const rentalRecordEarly =
        rentalExtras && typeof rentalExtras === 'object'
          ? (rentalExtras as Record<string, unknown>)
          : {};
      const rentalVariantsEarly = Array.isArray(rentalRecordEarly.variants)
        ? (rentalRecordEarly.variants as Record<string, unknown>[])
        : [];
      const selectedVariantEarly =
        rentalVariantsEarly.find((row) => typeof row?.id === 'string' && row.id === variantId) ?? null;
      const optionDurationMode =
        (selectedVariantEarly &&
          (selectedVariantEarly.durationMode === 'hourly' ||
            selectedVariantEarly.durationMode === 'daily' ||
            selectedVariantEarly.durationMode === 'both') &&
          selectedVariantEarly.durationMode) ||
        rentalRecordEarly.durationMode;
      const rentalWindow = authoritativeRentalWindow({
        timeZone: listingExtrasObj.departureTimezone,
        operatingDays: rentalRecordEarly.operatingDays,
        bookingNoticeHours: rentalRecordEarly.bookingNoticeHours,
        durationMode: optionDurationMode,
        minDurationHours:
          selectedVariantEarly?.minDurationHours ?? rentalRecordEarly.minDurationHours,
        maxDurationHours:
          selectedVariantEarly?.maxDurationHours ?? rentalRecordEarly.maxDurationHours,
        minDurationDays: selectedVariantEarly?.minDurationDays ?? rentalRecordEarly.minDurationDays,
        maxDurationDays: selectedVariantEarly?.maxDurationDays ?? rentalRecordEarly.maxDurationDays,
        pickupAt,
        returnAt,
        durationUnit,
      });
      if (!rentalWindow.ok) {
        return json({ success: false, error: rentalWindow.error }, 400);
      }
      if (durationCount !== rentalWindow.durationCount) {
        return json(
          {
            success: false,
            error: 'The rental length does not match the pickup and return times.',
            durationCount: rentalWindow.durationCount,
          },
          409
        );
      }

      if (!listingSupplierId) {
        return json({ success: false, error: 'Supplier commercial terms are not configured for this rental.' }, 409);
      }
      // Team eligibility + commercial terms are independent — run together.
      const [teamSelfResult, termsResult] = await Promise.all([
        admin
          .from('supplier_team_members')
          .select('user_id')
          .eq('supplier_id', listingSupplierId)
          .eq('user_id', user.id)
          .maybeSingle(),
        admin.rpc('supplier_active_commercial_terms', {
          p_supplier_id: listingSupplierId,
        }),
      ]);
      timing.mark('rentalPrepMs');
      if (teamSelfResult.error) {
        return json(
          { success: false, error: 'Could not verify booking eligibility. Try again.', timings: timing.snapshot() },
          500
        );
      }
      if (teamSelfResult.data?.user_id) {
        return json(
          {
            success: false,
            error: 'You cannot book a listing for your supplier account.',
            timings: timing.snapshot(),
          },
          403
        );
      }
      const rawTerms = Array.isArray(termsResult.data) ? termsResult.data[0] : termsResult.data;
      const terms =
        rawTerms && typeof rawTerms === 'object'
          ? (rawTerms as { id?: string | null; commission_bps?: number | null })
          : null;
      const commissionBps =
        terms && typeof terms.commission_bps === 'number' ? Math.round(terms.commission_bps) : Number.NaN;
      if (
        termsResult.error ||
        !terms?.id ||
        !Number.isInteger(commissionBps) ||
        commissionBps < 0 ||
        commissionBps > 10000
      ) {
        return json(
          {
            success: false,
            error: 'Supplier commercial terms are not configured for this rental.',
            timings: timing.snapshot(),
          },
          409
        );
      }
      const rentalQuote = quoteRentalCheckoutLine({
        rentalExtras,
        variantId,
        quantity: Math.floor(quantity),
        durationCount: rentalWindow.durationCount,
        durationUnit,
        commissionBps,
      });
      if (!rentalQuote.ok) {
        return json({ success: false, error: rentalQuote.error }, 400);
      }

      const totalAmountMajor = fromMinorUnits(rentalQuote.customerTotalMinor);
      if (
        typeof body.expectedTotal === 'number' &&
        Number.isFinite(body.expectedTotal) &&
        Math.round(body.expectedTotal * 100) !== rentalQuote.customerTotalMinor
      ) {
        return json(
          {
            success: false,
            error: 'Price changed. Refresh and try again.',
            expectedTotalMinor: rentalQuote.customerTotalMinor,
          },
          409
        );
      }

      const currency = String(
        (listingRow.price_currency as string | null) ?? body.currency ?? 'EUR'
      )
        .trim()
        .toUpperCase()
        .slice(0, 3) || 'EUR';
      const listingTitle =
        String(listingRow.title ?? body.listingTitle ?? 'Rental').trim() || 'Rental';
      const holdMinutes = 60;
      const holdExpiresAtIso = new Date(Date.now() + holdMinutes * 60_000).toISOString();
      // checkoutHoldExpiresAtUnix() treats its argument as "now" and adds another
      // hour. The rental hold timestamp is already absolute — Stripe needs that
      // unix second, and it must be at least 30 minutes ahead.
      const holdExpiresAtUnix = Math.floor(Date.parse(holdExpiresAtIso) / 1000);
      const idempotencyKey = [
        'rental',
        listingId,
        variantId,
        pickupAt,
        returnAt,
        String(rentalQuote.quantity),
        user.id,
      ].join(':');

      const rentalRecord =
        rentalExtras && typeof rentalExtras === 'object'
          ? (rentalExtras as Record<string, unknown>)
          : {};
      const variantRow = Array.isArray(rentalRecord.variants)
        ? rentalRecord.variants.find(
            (row) => row && typeof row === 'object' && String((row as { id?: unknown }).id ?? '') === variantId
          )
        : null;
      const variantName =
        variantRow && typeof (variantRow as { name?: unknown }).name === 'string'
          ? String((variantRow as { name?: unknown }).name).trim()
          : '';
      const pickupAddress =
        typeof rentalRecord.pickupAddress === 'string' ? rentalRecord.pickupAddress.trim() : '';
      const returnSameAsPickup = rentalRecord.returnSameAsPickup !== false;
      const returnAddress = returnSameAsPickup
        ? ''
        : typeof rentalRecord.returnAddress === 'string'
          ? rentalRecord.returnAddress.trim()
          : '';
      const rentalCoord = (value: unknown, min: number, max: number): number | null =>
        typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
      const pickupLat = rentalCoord(rentalRecord.pickupLat, -90, 90);
      const pickupLng = rentalCoord(rentalRecord.pickupLng, -180, 180);
      const returnLat = returnSameAsPickup ? pickupLat : rentalCoord(rentalRecord.returnLat, -90, 90);
      const returnLng = returnSameAsPickup ? pickupLng : rentalCoord(rentalRecord.returnLng, -180, 180);
      const pickupInstructions =
        typeof rentalRecord.pickupInstructions === 'string' ? rentalRecord.pickupInstructions.trim() : '';
      const returnInstructions = returnSameAsPickup
        ? ''
        : typeof rentalRecord.returnInstructions === 'string'
          ? rentalRecord.returnInstructions.trim()
          : '';
      const staffAssisted =
        typeof rentalRecord.staffAssisted === 'boolean' ? rentalRecord.staffAssisted : null;
      const collectionNotes =
        typeof rentalRecord.collectionNotes === 'string' ? rentalRecord.collectionNotes.trim() : '';
      const returnStaffAssisted =
        typeof rentalRecord.returnStaffAssisted === 'boolean' ? rentalRecord.returnStaffAssisted : null;
      const returnCollectionNotes =
        typeof rentalRecord.returnCollectionNotes === 'string'
          ? rentalRecord.returnCollectionNotes.trim()
          : '';
      const cancellationPreset =
        typeof rentalRecord.cancellationPreset === 'string' ? rentalRecord.cancellationPreset.trim() : '';
      const cancellationCopy: Record<string, string> = {
        flexible_24h:
          'Flexible. Customers may request cancellation until 24 hours before pickup. Traverion does not issue automatic rental refunds.',
        moderate_72h:
          'Moderate. Customers may request cancellation until 72 hours before pickup. Traverion does not issue automatic rental refunds.',
        firm_7d:
          'Firm. Customers may request cancellation until 7 days before pickup. Traverion does not issue automatic rental refunds.',
      };
      const depositAmountMinor =
        typeof rentalRecord.depositAmountMinor === 'number' && Number.isFinite(rentalRecord.depositAmountMinor)
          ? Math.round(rentalRecord.depositAmountMinor)
          : null;

      const purchaseSnapshot = {
        inventoryFamily: 'rental',
        listingTitle,
        variantId: rentalQuote.variantId,
        variantName: variantName || null,
        quantity: rentalQuote.quantity,
        pickupAt,
        returnAt,
        pickupAddress: pickupAddress || null,
        pickupLat,
        pickupLng,
        pickupInstructions: pickupInstructions || null,
        staffAssisted,
        collectionNotes: collectionNotes || null,
        returnAddress: returnAddress || null,
        returnLat,
        returnLng,
        returnInstructions: returnInstructions || null,
        returnStaffAssisted,
        returnCollectionNotes: returnCollectionNotes || null,
        returnSameAsPickup,
        durationCount: rentalQuote.durationCount,
        durationUnit: rentalQuote.durationUnit,
        unitMinor: rentalQuote.unitMinor,
        customerTotalMinor: rentalQuote.customerTotalMinor,
        commissionMinor: rentalQuote.commissionMinor,
        supplierEarningsMinor: rentalQuote.supplierEarningsMinor,
        commissionBps,
        discountApplied: rentalQuote.discountApplied,
        currency,
        rentalOpsStatus: 'awaiting_pickup',
        cancellationPreset: cancellationPreset || null,
        cancellationLabel: cancellationCopy[cancellationPreset] ?? null,
        depositAmountMinor,
        depositDisclosure: rentalQuote.depositDisclosure,
        priceBreakdown: {
          unitMinor: rentalQuote.unitMinor,
          quantity: rentalQuote.quantity,
          durationCount: rentalQuote.durationCount,
          durationUnit: rentalQuote.durationUnit,
          discountApplied: rentalQuote.discountApplied,
        },
      };

      const claimed = await admin.rpc('claim_rental_checkout_booking', {
        p_listing_id: listingId,
        p_variant_id: variantId,
        p_quantity: rentalQuote.quantity,
        p_starts_at: pickupAt,
        p_ends_at: returnAt,
        p_guest_email: email,
        p_guest_name: customerName?.trim() || null,
        p_guest_user_id: user.id,
        p_total_amount: totalAmountMajor,
        p_currency: currency,
        p_purchase_snapshot: purchaseSnapshot,
        p_idempotency_key: idempotencyKey,
        p_hold_expires_at: holdExpiresAtIso,
        p_hold_ttl_minutes: holdMinutes,
      });
      timing.mark('rentalClaimMs');
      if (claimed.error) {
        return json({ success: false, error: claimed.error.message, timings: timing.snapshot() }, 500);
      }
      const claimRow = claimed.data as {
        ok?: boolean;
        booking_id?: string;
        hold_id?: string;
        idempotent?: boolean;
        error?: string;
        available?: number;
      } | null;
      if (!claimRow || claimRow.ok !== true || !claimRow.booking_id) {
        const conflict =
          claimRow?.error === 'insufficient_stock' ||
          claimRow?.error === 'hold_failed' ||
          typeof claimRow?.available === 'number';
        return json(
          {
            success: false,
            error:
              claimRow?.error === 'insufficient_stock'
                ? 'Not enough rental inventory for those dates.'
                : claimRow?.error ?? 'Could not reserve this rental.',
            available: claimRow?.available,
            timings: timing.snapshot(),
          },
          conflict ? 409 : 400
        );
      }
      targetBookingId = claimRow.booking_id;

      const stripe = new Stripe(stripeSecret);

      // Idempotent retry: reuse an open Stripe session instead of creating another.
      if (claimRow.idempotent === true) {
        const { data: priorRow } = await admin
          .from('bookings')
          .select('checkout_session_id, payment_status, status')
          .eq('id', targetBookingId)
          .maybeSingle();
        const priorSessionId =
          priorRow && typeof priorRow.checkout_session_id === 'string'
            ? priorRow.checkout_session_id.trim()
            : '';
        if (
          priorSessionId &&
          priorRow &&
          priorRow.status !== 'cancelled' &&
          (priorRow.payment_status === 'pending' || priorRow.payment_status === 'failed')
        ) {
          try {
            const priorSession = await stripe.checkout.sessions.retrieve(priorSessionId);
            if (priorSession.status === 'open' && typeof priorSession.url === 'string' && priorSession.url) {
              timing.mark('stripeSessionMs');
              console.info('[Traverion] rental checkout timing', {
                correlationId: idempotencyKey.slice(0, 64),
                reusedSession: true,
                stages: timing.snapshot(),
              });
              return json({
                success: true,
                checkoutUrl: priorSession.url,
                sessionId: priorSession.id,
                bookingId: targetBookingId,
                inventoryFamily: 'rental',
                quotedTotal: totalAmountMajor,
                currency,
                timings: timing.snapshot(),
              });
            }
          } catch {
            /* fall through — create a fresh session */
          }
        }
      }

      // Freeze commercial terms before Stripe so redirect is not blocked by a
      // post-session RPC, and we never leave a payable session without terms.
      try {
        const frozen = await admin.rpc('freeze_booking_commercial_terms', {
          p_booking_id: targetBookingId,
        });
        const freezeRow = (Array.isArray(frozen.data) ? frozen.data[0] : frozen.data) as {
          ok?: boolean;
        } | null;
        timing.mark('rentalFreezeMs');
        if (frozen.error || !freezeRow || freezeRow.ok !== true) {
          await admin.rpc('release_rental_checkout_booking', {
            p_booking_id: targetBookingId,
            p_reason: 'commercial_terms_missing',
          });
          return json(
            {
              success: false,
              error: 'Supplier commercial terms are not configured for this rental.',
              timings: timing.snapshot(),
            },
            409
          );
        }
      } catch {
        await admin.rpc('release_rental_checkout_booking', {
          p_booking_id: targetBookingId,
          p_reason: 'commercial_terms_missing',
        });
        return json(
          {
            success: false,
            error: 'Supplier commercial terms are not configured for this rental.',
            timings: timing.snapshot(),
          },
          409
        );
      }

      const amountMinor = rentalQuote.customerTotalMinor;
      let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
      try {
        session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            locale: 'en',
            custom_text: {
              submit: {
                message:
                  'Traverion uses Stripe to process this payment. Your rental is confirmed only after payment succeeds.',
              },
            },
            customer_email: email,
            expires_at: holdExpiresAtUnix,
            success_url: `${publicSiteUrl}${successPath}${
              successPath.includes('?') ? '&' : '?'
            }session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${publicSiteUrl}${appendBookingParam(cancelPath, targetBookingId)}`,
            payment_method_types: ['card'],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: currency.toLowerCase(),
                  unit_amount: amountMinor,
                  product_data: {
                    name: listingTitle,
                    description: `Rental · ${rentalQuote.quantity} unit${
                      rentalQuote.quantity === 1 ? '' : 's'
                    } · ${rentalQuote.durationCount} ${rentalQuote.durationUnit}${
                      rentalQuote.durationCount === 1 ? '' : 's'
                    }`,
                  },
                },
              },
            ],
            metadata: {
              booking_id: targetBookingId,
              listing_id: listingId,
              user_id: user.id,
              booking_option_id: variantId,
              quoted_total: String(totalAmountMajor),
              inventory_family: 'rental',
              ...envStamp,
            },
            payment_intent_data: {
              metadata: {
                booking_id: targetBookingId,
                listing_id: listingId,
                user_id: user.id,
                inventory_family: 'rental',
                ...envStamp,
              },
            },
          },
          { idempotencyKey: `rental_cs_${idempotencyKey}`.slice(0, 255) }
        );
      } catch (stripeErr) {
        console.error(
          'rental checkout session create failed',
          stripeErr instanceof Error ? stripeErr.message : 'unknown'
        );
        try {
          await admin.rpc('release_rental_checkout_booking', {
            p_booking_id: targetBookingId,
            p_reason: 'stripe_session_create_failed',
          });
        } catch {
          /* hold expires on its own if release fails */
        }
        return json(
          { success: false, error: 'Could not start payment. Try again.', timings: timing.snapshot() },
          500
        );
      }
      timing.mark('stripeSessionMs');

      const { data: updatedRows, error: updateError } = await admin
        .from('bookings')
        .update({
          checkout_session_id: session.id,
          payment_intent_id: null,
          hold_expires_at: session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : holdExpiresAtIso,
          purchase_snapshot: {
            ...purchaseSnapshot,
            holdId: claimRow.hold_id ?? null,
            checkoutIdempotencyKey: idempotencyKey,
          },
          total_amount: totalAmountMajor,
          currency,
          payment_status: 'pending',
          ...(customerName?.trim() ? { guest_name: customerName.trim() } : {}),
        })
        .eq('id', targetBookingId)
        .in('payment_status', ['pending', 'failed'])
        .neq('status', 'cancelled')
        .select('id');
      timing.mark('rentalPersistMs');

      if (updateError || !(updatedRows ?? []).length) {
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch {
          // ignore
        }
        return json(
          {
            success: false,
            error: 'Checkout created but booking update failed',
            timings: timing.snapshot(),
          },
          500
        );
      }

      console.info('[Traverion] rental checkout timing', {
        correlationId: idempotencyKey.slice(0, 64),
        reusedSession: false,
        stages: timing.snapshot(),
      });
      return json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        bookingId: targetBookingId,
        inventoryFamily: 'rental',
        quotedTotal: totalAmountMajor,
        currency,
        timings: timing.snapshot(),
      });
    }
    if (extrasFamily === 'stay' && targetBookingId) {
      // Phase 1539: column → nights → purchase_snapshot.checkOut (1524 parity with optionId 1536).
      const restored = resumeStayCheckoutDate({
        bodyCheckoutDate: checkoutDate,
        bookingCheckOut: resumeStayCheckOut,
        bookingDate,
        bookingNights: resumeStayNights,
        specialRequests: resumeStayNotes,
        purchaseSnapshot: resumePurchaseSnapshot,
        resolveFromBooking: stayRangeFromBooking,
      });
      if (restored) checkoutDate = restored;
    }
    if (extrasFamily === 'stay' && !checkoutDate) {
      return json({ success: false, error: 'Choose valid check-in and check-out dates.' }, 400);
    }

    const effectiveGuestName = resumeStayLeadGuestName({
      bodyCustomerName: customerName,
      bookingGuestName: resumeGuestName,
    });
    if (!stayCheckoutLeadGuestNameReady(effectiveGuestName)) {
      return json(
        {
          success: false,
          error: 'Enter the lead guest name so the host knows who is arriving.',
        },
        400
      );
    }

    let confirmedOccupancy: Array<{
      status?: string | null;
      payment_status?: string | null;
      booking_date?: string | null;
      booking_option_id?: string | null;
      start_time?: string | null;
      purchase_snapshot?: unknown;
    }> = [];
    if (extrasFamily !== 'stay') {
      const confirmedLookup = await admin
        .from('bookings')
        .select('status, payment_status, booking_date, booking_option_id, start_time, purchase_snapshot')
        .eq('listing_id', listingId)
        .eq('booking_date', bookingDate);
      if (!confirmedLookup.error) confirmedOccupancy = confirmedLookup.data ?? [];
    }

    const quote = quoteListingBooking({
      listing,
      discounts,
      bookingDate,
      guests,
      bookingOptionId: storedOptionId,
      checkoutDate: checkoutDate || null,
      stayParty: readStayGuestParty(body.stayParty),
      stayExtras: readStayExtraSelection(body.stayExtras),
      participantMix,
      startTime: startTime || null,
      confirmedOccupancy,
      existingHold: Boolean(targetBookingId),
    });
    if (!quote.ok) {
      return json({ success: false, error: quote.error }, 400);
    }
    if (typeof quote.guests === 'number' && quote.guests >= 1) {
      guests = quote.guests;
    }

    // Price integrity: refuse Stripe when the review-screen total no longer matches the server quote.
    const expectedTotalRaw = body.expectedTotal;
    if (typeof expectedTotalRaw === 'number' && Number.isFinite(expectedTotalRaw)) {
      const expectedMinor = Math.round(expectedTotalRaw * 100);
      const quotedMinor = Math.round(quote.totalAmount * 100);
      if (expectedMinor !== quotedMinor) {
        return json(
          {
            success: false,
            error: 'The total changed. Review the updated price before continuing to payment.',
            code: 'quote_changed',
            quotedTotal: quote.totalAmount,
            currency: quote.currency,
          },
          409
        );
      }
    }

    // Phase 1534: freeze quote-resolved departure when body omitted startTime
    // (single-option default / schedule) so capacity assert + snapshot match cutoff.
    if (!startTime && extrasFamily !== 'stay') {
      const resolvedHm = resolveTourDepartureHmForCutoff({
        listingExtras: listingRow.listing_extras,
        bookingDate,
        bookingOptionId: quote.optionId ?? storedOptionId,
        frozenStartTimeHm: null,
      });
      if (resolvedHm) startTime = resolvedHm;
    }

    const optionFields = resolveOptionFieldsForSnapshot({
      listingExtras: listingRow.listing_extras,
      optionId: quote.optionId ?? storedOptionId,
      bookingDate,
      startTimeHm: startTime || null,
    });

    const travelerPoint = parseTravelerPickupPoint(body.travelerPickup);
    const pickupDecision =
      extrasFamily === 'stay'
        ? { ok: true as const, address: null as string | null }
        : travelerPickupAllowed({
            fulfillment: optionFields.fulfillment,
            area: pickupAreaFromOption({
              fulfillment: optionFields.fulfillment,
              pickupPlace: optionFields.pickupPlace,
              pickupCenterLat: optionFields.pickupCenterLat,
              pickupCenterLng: optionFields.pickupCenterLng,
              pickupRadiusKm: optionFields.pickupRadiusKm,
              pickupPlaceId: optionFields.pickupPlaceId,
            }),
            point: travelerPoint,
          });
    if (!pickupDecision.ok) {
      return json({ success: false, error: pickupDecision.error }, 400);
    }
    const notesForClaim =
      extrasFamily === 'stay'
        ? specialRequests
        : optionFields.fulfillment === 'meeting_point'
          ? notesWithoutPlaceOfStay(specialRequests)
          : pickupDecision.address
            ? notesWithVerifiedPickup(specialRequests, pickupDecision.address)
            : specialRequests;

    // Phase 1325: do not freeze listing_stay_private onto pending holds.
    // promote-paid-from-checkout merges checkInAddress when payment is collected.
    const stayFields =
      extrasFamily === 'stay'
        ? resolveStayFieldsForSnapshot({
            listingExtras: listingRow.listing_extras,
            checkIn: bookingDate,
            checkOut: checkoutDate || null,
            nights: typeof quote.nights === 'number' ? quote.nights : null,
            checkInAddressOverride: null,
          })
        : null;

    const cancelSnap = resolveStayCancellationForSnapshot({
      isStay: extrasFamily === 'stay',
      listingExtras: listingRow.listing_extras,
      listingCancellationPolicy:
        typeof (listingRow as { cancellation_policy?: unknown }).cancellation_policy === 'string'
          ? (listingRow as { cancellation_policy: string }).cancellation_policy
          : null,
    });

    const purchaseSnapshot = buildPurchaseSnapshot({
      listingTitle,
      optionLabel: quote.optionLabel ?? null,
      meetingPoint: resolveMeetingPointForSnapshot({
        optionPickupPlace: optionFields.pickupPlace,
        listingMeetingPoint:
          typeof listingRow.meeting_point === 'string' ? listingRow.meeting_point : null,
      }),
      pickupInstructions: resolvePickupInstructionsForSnapshot({
        travelerStartInstructions: optionFields.travelerStartInstructions,
        optionInfo: optionFields.optionInfo,
        listingPickupInstructions:
          typeof listingRow.pickup_instructions === 'string' ? listingRow.pickup_instructions : null,
      }),
      startTimeHm: startTime || null,
      duration: optionFields.duration,
      fulfillment: optionFields.fulfillment,
      cancellationPolicy: cancelSnap.cancellationPolicy,
      cancellationPreset: cancelSnap.cancellationPreset,
      freeCancelHours: cancelSnap.freeCancelHours,
      optionId: quote.optionId ?? storedOptionId,
      scheduleId: optionFields.scheduleId,
      currency: quote.currency,
      totalAmount: quote.totalAmount,
      stayPrice:
        extrasFamily === 'stay' && quote.stayPriceLines
          ? freezeStayBookingPrice({
              lines: quote.stayPriceLines,
              total: quote.totalAmount,
              requests: quote.stayRequests,
            })
          : null,
      checkIn: stayFields?.checkIn ?? null,
      checkOut: stayFields?.checkOut ?? null,
      nights: stayFields?.nights ?? null,
      travelerPickupAddress: pickupDecision.address,
      travelerPickupPlaceId: pickupDecision.address ? travelerPoint?.placeId ?? null : null,
      travelerPickupLat: pickupDecision.address ? travelerPoint?.lat ?? null : null,
      travelerPickupLng: pickupDecision.address ? travelerPoint?.lng ?? null : null,
      pickupTiming: optionFields.pickupTiming,
      pickupWindowMinutes: optionFields.pickupWindowMinutes,
      pickupTimeConfirmation: optionFields.pickupTimeConfirmation,
      dropoffMode: optionFields.dropoffMode,
      dropoffPlace: optionFields.dropoffPlace,
      transportMode: optionFields.transportMode,
      transportOther: optionFields.transportOther,
      departureTimezone:
        typeof (listingRow.listing_extras as { departureTimezone?: unknown } | null)?.departureTimezone ===
        'string'
          ? ((listingRow.listing_extras as { departureTimezone: string }).departureTimezone || null)
          : null,
      propertyType: stayFields?.propertyType ?? null,
      checkInAddress: null,
      checkInTime: stayFields?.checkInTime ?? null,
      checkOutTime: stayFields?.checkOutTime ?? null,
      houseRules: stayFields?.houseRules ?? null,
      includes: normalizePurchaseStringList(
        (listingRow as { includes?: unknown }).includes
      ),
      excludes: normalizePurchaseStringList(
        (listingRow as { excludes?: unknown }).excludes
      ),
      termsAcceptedAt,
    });

    if (extrasFamily === 'stay' && checkoutDate) {
      // Phase 1540: include purchase_snapshot so snapshot-only competitors resolve 1524 ranges
      // (parity with tour occupancy select and SQL stay_booking_check_out).
      // Occupancy bookings + operator-blocked nights are independent — fetch together.
      const [stayBusyResult, blockedResult] = await Promise.all([
        admin
          .from('bookings')
          .select(
            'id, booking_date, check_out, nights, special_requests, status, payment_status, hold_expires_at, created_at, purchase_snapshot'
          )
          .eq('listing_id', listingId)
          .neq('status', 'cancelled'),
        admin
          .from('listing_availability')
          .select('available_date, capacity')
          .eq('listing_id', listingId)
          .gte('available_date', bookingDate)
          .lt('available_date', checkoutDate),
      ]);
      timing.mark('stayOccupancyMs');
      let stayBusyErr = stayBusyResult.error;
      let existingStayBookings = stayBusyResult.data;
      const stayRows =
        stayBusyErr && /check_out|nights|purchase_snapshot/i.test(stayBusyErr.message)
          ? (
              await admin
                .from('bookings')
                .select(
                  stayBusyErr.message.match(/purchase_snapshot/i)
                    ? 'id, booking_date, check_out, nights, special_requests, status, payment_status, hold_expires_at, created_at'
                    : 'id, booking_date, special_requests, status, payment_status, hold_expires_at, created_at'
                )
                .eq('listing_id', listingId)
                .neq('status', 'cancelled')
            ).data
          : existingStayBookings;
      if (stayBusyErr && !/check_out|nights|purchase_snapshot/i.test(stayBusyErr.message)) {
        return json({ success: false, error: stayBusyErr.message, timings: timing.snapshot() }, 500);
      }
      if (
        stayCheckoutNightsAlreadyBooked(
          (stayRows ?? []) as StayCheckoutOccupancyRow[],
          bookingDate,
          checkoutDate,
          targetBookingId
        )
      ) {
        return json({ success: false, error: 'Those nights are already booked.', timings: timing.snapshot() }, 409);
      }

      const blockedRows = blockedResult.data;
      for (const row of blockedRows ?? []) {
        if (stayNightIsOperatorBlocked(Number(row.capacity ?? 0))) {
          return json({ success: false, error: 'Those nights are blocked.', timings: timing.snapshot() }, 409);
        }
      }
    } else {
      let tourRows: TourCheckoutOccupancyRow[] | null = null;
      let canScopeByStartTime = Boolean(startTime);
      {
        const withTime = await admin
          .from('bookings')
          .select('id, booking_date, guests, status, payment_status, hold_expires_at, created_at, start_time, purchase_snapshot, booking_option_id')
          .eq('listing_id', listingId)
          .eq('booking_date', bookingDate);
        if (withTime.error && /start_time|purchase_snapshot|booking_option_id/i.test(withTime.error.message)) {
          const fallback = await admin
            .from('bookings')
            .select('id, booking_date, guests, status, payment_status, hold_expires_at, created_at, start_time')
            .eq('listing_id', listingId)
            .eq('booking_date', bookingDate);
          if (fallback.error && /start_time/i.test(fallback.error.message)) {
            const bare = await admin
              .from('bookings')
              .select('id, booking_date, guests, status, payment_status, hold_expires_at, created_at')
              .eq('listing_id', listingId)
              .eq('booking_date', bookingDate);
            if (bare.error) return json({ success: false, error: bare.error.message }, 500);
            tourRows = (bare.data ?? []) as TourCheckoutOccupancyRow[];
            canScopeByStartTime = false;
          } else if (fallback.error) {
            return json({ success: false, error: fallback.error.message }, 500);
          } else {
            tourRows = (fallback.data ?? []) as TourCheckoutOccupancyRow[];
          }
        } else if (withTime.error) {
          return json({ success: false, error: withTime.error.message }, 500);
        } else {
          tourRows = (withTime.data ?? []) as TourCheckoutOccupancyRow[];
        }
      }

      const { data: capRow } = await admin
        .from('listing_availability')
        .select('capacity')
        .eq('listing_id', listingId)
        .eq('available_date', bookingDate)
        .maybeSingle();
      // Explicit capacity 0 = partner closed the day. Missing row = option/schedule max.
      // Phase 1113: with startTime, remaining = min(slot_left, day_left when override).
      let capacity: number;
      let slotScoped = false;
      let dayOccupiedForDual: number | null = null;
      const dayOverrideCap =
        capRow != null && Number.isFinite(Number(capRow.capacity)) ? Number(capRow.capacity) : null;
      if (dayOverrideCap != null && dayOverrideCap < 1) {
        return json({ success: false, error: 'This date is not available.' }, 409);
      }
      const slotCap = tourDepartureSlotCapacity({
        listing_extras: listingRow.listing_extras,
        bookingDate,
        bookingOptionId: storedOptionId || quote.optionId,
        startTime: startTime || null,
      });
      if (canScopeByStartTime && slotCap != null) {
        capacity = slotCap;
        slotScoped = true;
        if (dayOverrideCap != null) {
          dayOccupiedForDual = tourCheckoutOccupiedGuests(
            tourRows ?? [],
            bookingDate,
            targetBookingId,
            Date.now(),
            null
          );
        }
      } else if (dayOverrideCap != null) {
        capacity = dayOverrideCap;
      } else if (slotCap != null) {
        capacity = slotCap;
        slotScoped = canScopeByStartTime;
      } else {
        // Phase 1122: unresolved option/schedule cap must not fall back to MAX across
        // every schedule (that overstated capacity vs assert weekday+option / quote).
        return json(
          { success: false, error: 'No bookable capacity for this departure.' },
          409
        );
      }
      const occupied = tourCheckoutOccupiedGuests(
        tourRows ?? [],
        bookingDate,
        targetBookingId,
        Date.now(),
        slotScoped ? startTime : null
      );
      const remaining =
        slotScoped && dayOverrideCap != null && dayOccupiedForDual != null
          ? tourDepartureRemainingSeats({
              slotMaxSpots: capacity,
              paidGuestsSlot: occupied,
              dayCapacityOverride: dayOverrideCap,
              paidGuestsDay: dayOccupiedForDual,
            })
          : Math.max(0, capacity - occupied);
      if (remaining < guests) {
        return json(
          {
            success: false,
            error: slotScoped
              ? 'Not enough capacity left for this departure.'
              : 'Not enough capacity left for this date.',
          },
          409
        );
      }
      if (!targetBookingId && startTime) {
        const optionId = String(quote.optionId ?? storedOptionId ?? '');
        const policy = lastMinutePolicyFromListingExtras(listingRow.listing_extras, optionId);
        const zone =
          listingRow.listing_extras && typeof listingRow.listing_extras === 'object'
            ? resolveDepartureTimezone(
                (listingRow.listing_extras as { departureTimezone?: unknown }).departureTimezone
              )
            : resolveDepartureTimezone(null);
        const window = evaluateDepartureBookingWindow({
          bookingDate,
          startTimeHm: startTime,
          cutoffHoursBeforeStart: effectiveBookingCutoffHours({
            listingExtras: listingRow.listing_extras,
            bookingOptionId: optionId,
            bookingDate,
            startTimeHm: startTime,
          }),
          timeZone: zone,
          lastMinuteEnabled: policy.enabled,
          lastMinuteUntil: policy.until,
          confirmedPaidOnDeparture: departureHasConfirmedPaidBooking(tourRows ?? [], {
            date: bookingDate,
            startTimeHm: startTime,
            optionId,
          }),
        });
        if (!window.ok) return json({ success: false, error: window.error }, 409);
      }
    }

    const totalAmount = quote.totalAmount;
    const currency = quote.currency;
    const isStayRequestToBook =
      extrasFamily === 'stay' && stayBookingMethodFromListingExtras(listingRow.listing_extras) === 'request';
    const holdExpiresAtUnix = checkoutHoldExpiresAtUnix();
    const holdExpiresAtIso = new Date(holdExpiresAtUnix * 1000).toISOString();
    // Phase 1522: strip client-planted machine keys (check_out:, meeting_point:, …)
    // before claim; only server-derived optionId / checkoutDate may append those lines.
    const claimSpecialRequests = buildCheckoutClaimSpecialRequests({
      customerPhone,
      specialRequests: notesForClaim,
      optionId: quote.optionId,
      checkOutDate: checkoutDate || null,
    });

    // Phase 1541/1572: stay columns for claim + session update.
    // Phase 1572: merge resume snap BEFORE columns/assert (not only on UPDATE after assert).
    const purchaseSnapshotForUpdate =
      targetBookingId && resumePurchaseSnapshot != null
        ? mergePurchaseSnapshotMaxCheckOut(resumePurchaseSnapshot, purchaseSnapshot)
        : purchaseSnapshot;
    const mergedStayOutRaw =
      typeof purchaseSnapshotForUpdate.checkOut === 'string'
        ? purchaseSnapshotForUpdate.checkOut.trim()
        : '';
    const stayOutCandidates = [checkoutDate, resumeStayCheckOut, mergedStayOutRaw].filter(
      (d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    );
    const stayOutForColumns =
      extrasFamily === 'stay' && stayOutCandidates.length > 0
        ? stayOutCandidates.reduce((a, b) => (a > b ? a : b))
        : checkoutDate;
    let stayColumns = stayBookingColumnsForCheckoutUpdate({
      inventoryFamily: extrasFamily === 'stay' ? 'stay' : null,
      bookingDate,
      checkoutDate: stayOutForColumns || checkoutDate,
      quoteNights:
        typeof purchaseSnapshotForUpdate.nights === 'number' && purchaseSnapshotForUpdate.nights >= 1
          ? purchaseSnapshotForUpdate.nights
          : quote.nights,
    });
    // Phase 1570: never shorten check_out/nights vs an already-persisted longer resume column.
    if (stayColumns && resumeStayCheckOut && /^\d{4}-\d{2}-\d{2}$/.test(resumeStayCheckOut)) {
      if (resumeStayCheckOut > stayColumns.check_out) {
        const checkIn = bookingDate.trim();
        const nights = Math.round(
          (Date.parse(`${resumeStayCheckOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) /
            86400000
        );
        stayColumns = {
          check_out: resumeStayCheckOut,
          nights: nights >= 1 ? nights : stayColumns.nights,
        };
      }
    }

    if (!targetBookingId) {
      const stayNights = stayColumns?.nights ?? null;
      const claimArgs = {
        p_listing_id: listingId,
        p_guest_email: email,
        p_guest_name: effectiveGuestName || null,
        p_guests: guests,
        p_booking_date: bookingDate,
        p_check_out: stayColumns?.check_out ?? null,
        p_special_requests: claimSpecialRequests,
        p_total_amount: totalAmount,
        p_currency: currency,
        p_guest_user_id: user.id,
        p_booking_option_id: quote.optionId,
        p_nights: stayNights != null && stayNights >= 1 ? stayNights : null,
        p_nightly_amount: stayNights != null && stayNights >= 1 ? quote.unitPrice : null,
        p_cleaning_fee:
          stayNights != null && stayNights >= 1
            ? typeof quote.cleaningFee === 'number'
              ? quote.cleaningFee
              : Math.round((quote.totalAmount - quote.unitPrice * stayNights) * 100) / 100
            : null,
        p_hold_expires_at: holdExpiresAtIso,
        p_start_time: startTime || null,
      };
      const claimed = await admin.rpc('claim_pending_checkout_booking', claimArgs);
      if (claimed.error) {
        const conflict = /already booked|not enough capacity|occupied|nights are blocked|no bookable capacity/i.test(
          claimed.error.message
        );
        if (conflict) return json({ success: false, error: claimed.error.message }, 409);
        // Phase 1153: self-book from claim (146) → 403, not 500.
        if (/cannot book your own listing|supplier account/i.test(claimed.error.message)) {
          return json({ success: false, error: claimed.error.message }, 403);
        }
        const missingFn = isMissingPostgresFunctionError(claimed.error.message);
        if (!missingFn) return json({ success: false, error: claimed.error.message }, 500);
        // Phase 1153: claim RPC missing — fail closed (no bare insert bypass of 146).
        return json(
          { success: false, error: 'Checkout hold guard unavailable. Try again later.' },
          500
        );
      } else {
        const id = claimed.data as string | null;
        if (!id) return json({ success: false, error: 'Could not create booking' }, 500);
        targetBookingId = id;
        if (startTime) {
          await admin.from('bookings').update({ start_time: startTime }).eq('id', id);
        }
      }
    } else {
      // Phase 1571: assert exclusive stay out from healed stayColumns (1570), not raw quote checkoutDate.
      const stayAssertOut =
        extrasFamily === 'stay'
          ? stayColumns?.check_out ?? (checkoutDate || null)
          : null;
      const { error: inventoryErr } = await admin.rpc('assert_checkout_inventory', {
        p_listing_id: listingId,
        p_check_in: bookingDate,
        p_guests: guests,
        p_check_out: stayAssertOut,
        p_exclude_booking_id: targetBookingId,
        p_start_time: startTime || null,
        p_booking_option_id: quote.optionId || storedOptionId || null,
      });
      if (inventoryErr) {
        // Phase 1096: missing assert must not resume Pay as if inventory were free.
        if (isMissingPostgresFunctionError(inventoryErr.message)) {
          return json(
            { success: false, error: 'Checkout inventory guard unavailable. Try again later.' },
            500
          );
        }
        const conflict = /already booked|not enough capacity|occupied|nights are blocked|no bookable capacity/i.test(
          inventoryErr.message
        );
        return json({ success: false, error: inventoryErr.message }, conflict ? 409 : 500);
      }
      // Defer total_amount / payment_status write until the new Checkout session is
      // stored, so a still-current session cannot be underpay-rejected against a
      // raised quote before checkout_session_id rotates.
      resumeQuoteSync = {
        totalAmount,
        currency,
        guestName: effectiveGuestName || null,
        optionId: quote.optionId ?? null,
        holdExpiresAtIso,
      };
    }

    timing.mark('preStripeMs');
    const stripe = new Stripe(stripeSecret);
    const appliedDiscountId = quote.appliedDiscountId ?? null;
    if (appliedDiscountId) {
      const claimedOffer = await admin.rpc('claim_offer_redemption', {
        p_discount_id: appliedDiscountId,
        p_booking_id: targetBookingId,
      });
      if (claimedOffer.error) {
        if (!isMissingPostgresFunctionError(claimedOffer.error.message)) {
          return json({ success: false, error: 'Could not reserve this offer. Try again.' }, 500);
        }
      } else if (claimedOffer.data !== true) {
        return json(
          {
            success: false,
            error:
              'This offer has reached its booking limit. The regular price is still available — go back and book again.',
          },
          409
        );
      }
    } else {
      const cleared = await admin
        .from('bookings')
        .update({ applied_discount_id: null })
        .eq('id', targetBookingId);
      if (cleared.error && !/applied_discount_id/i.test(cleared.error.message)) {
        return json({ success: false, error: 'Could not reserve this offer. Try again.' }, 500);
      }
    }
    const amountMinor = Math.round(totalAmount * 100);
    if (!Number.isFinite(amountMinor) || amountMinor < 1) {
      if (appliedDiscountId) {
        await admin.from('bookings').update({ applied_discount_id: null }).eq('id', targetBookingId);
      }
      return json({ success: false, error: 'Booking amount must be > 0' }, 400);
    }

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'en',
      custom_text: {
        submit: {
          message: isStayRequestToBook
            ? 'Your card is authorized now. The host has 24 hours to accept. Payment is captured only after they accept.'
            : 'Traverion uses Stripe to process this payment. Your booking is confirmed only after payment succeeds.',
        },
      },
      customer_email: email,
      expires_at: holdExpiresAtUnix,
      success_url: `${publicSiteUrl}${successPath}${successPath.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicSiteUrl}${appendBookingParam(cancelPath, targetBookingId)}`,
      // Cards support manual capture for Request to Book. Other methods stay on Instant only.
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amountMinor,
            product_data: {
              name: listingTitle,
              description: `${bookingDate} · ${guests} ${guests === 1 ? 'guest' : 'guests'}${
                quote.optionLabel ? ` · ${quote.optionLabel}` : ''
              }`,
            },
          },
        },
      ],
      metadata: {
        booking_id: targetBookingId,
        listing_id: listingId,
        user_id: user.id,
        booking_option_id: quote.optionId ?? '',
        quoted_total: String(totalAmount),
        stay_request_to_book: isStayRequestToBook ? '1' : '0',
        ...envStamp,
      },
      payment_intent_data: {
        ...(isStayRequestToBook ? { capture_method: 'manual' as const } : {}),
        metadata: {
          booking_id: targetBookingId,
          listing_id: listingId,
          user_id: user.id,
          stay_request_to_book: isStayRequestToBook ? '1' : '0',
          ...envStamp,
        },
      },
    });
      timing.mark('stripeCreateMs');
    } catch {
      if (appliedDiscountId) {
        await admin.from('bookings').update({ applied_discount_id: null }).eq('id', targetBookingId);
      }
      return json({ success: false, error: 'Could not start payment. Try again.' }, 500);
    }

    const sessionUpdateBase: Record<string, unknown> = {
      checkout_session_id: session.id,
      // Clear prior PI so stale payment_intent.payment_failed cannot kill this session.
      payment_intent_id: null,
      hold_expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : holdExpiresAtIso,
      // Phase 1570: max-merge checkOut with existing row snap (mig 209 promote parity).
      // Phase 1572: reuse purchaseSnapshotForUpdate computed before assert.
      purchase_snapshot: purchaseSnapshotForUpdate,
      // Phase 1541: backfill check_out/nights so resume does not leave snapshot-only stays.
      ...(stayColumns ?? {}),
      ...(quote.guestBreakdown?.length ? { guest_breakdown: quote.guestBreakdown } : {}),
      ...(resumeQuoteSync
        ? {
            total_amount: resumeQuoteSync.totalAmount,
            currency: resumeQuoteSync.currency,
            // Revive holds that expire_stale_checkout_holds flipped to failed mid-Pay-now.
            payment_status: 'pending',
            ...(resumeQuoteSync.guestName ? { guest_name: resumeQuoteSync.guestName } : {}),
            ...(resumeQuoteSync.optionId ? { booking_option_id: resumeQuoteSync.optionId } : {}),
          }
        : {}),
    };

    let updatedRows: { id: string }[] | null = null;
    let updateError: { message: string } | null = null;
    {
      const first = await admin
        .from('bookings')
        .update(sessionUpdateBase)
        .eq('id', targetBookingId)
        .in('payment_status', ['pending', 'failed'])
        .neq('status', 'cancelled')
        .select('id');
      if (first.error && /purchase_snapshot/i.test(first.error.message)) {
        const { purchase_snapshot: _drop, ...withoutSnap } = sessionUpdateBase;
        const retry = await admin
          .from('bookings')
          .update(withoutSnap)
          .eq('id', targetBookingId)
          .in('payment_status', ['pending', 'failed'])
          .neq('status', 'cancelled')
          .select('id');
        updatedRows = (retry.data ?? null) as { id: string }[] | null;
        updateError = retry.error;
      } else {
        updatedRows = (first.data ?? null) as { id: string }[] | null;
        updateError = first.error;
      }
    }
    if (updateError) {
      // Phase 1778: expire orphan Checkout when booking update fails after session.create.
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // Already complete/expired — continue.
      }
      return json({ success: false, error: 'Checkout created but booking update failed' }, 500);
    }

    // Commercial V1: freeze supplier terms at checkout so mid-checkout plan changes
    // cannot mutate this booking's economics at payment settle.
    try {
      await admin.rpc('freeze_booking_commercial_terms', { p_booking_id: targetBookingId });
    } catch {
      // Non-fatal if migration not yet applied on a given env; settle falls back at pay.
    }

    if ((updatedRows ?? []).length === 0) {
      // Concurrent webhook may have marked paid while Stripe created this session.
      const { data: again } = await admin
        .from('bookings')
        .select('payment_status')
        .eq('id', targetBookingId)
        .maybeSingle();
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // Already complete/expired — continue.
      }
      if (checkoutResumeLostRaceToPaid(again?.payment_status)) {
        return json({
          success: false,
          error: 'This booking is already paid',
          alreadyPaid: (again?.payment_status ?? '').toLowerCase() === 'paid',
          alreadyRefunded: (again?.payment_status ?? '').toLowerCase() === 'refunded',
          bookingId: targetBookingId,
        }, 400);
      }
      return json({
        success: false,
        error: 'This booking cannot be paid',
        bookingId: targetBookingId,
      }, 400);
    }

    // Expire after the booking points at the new session so the expire webhook
    // is treated as stale and cannot flip payment_status to failed.
    if (priorCheckoutSessionId && priorCheckoutSessionId !== session.id) {
      try {
        await stripe.checkout.sessions.expire(priorCheckoutSessionId);
      } catch {
        // Already expired, completed, or unknown — continue.
      }
    }

    timing.mark('stripeSessionMs');
    const timings = timing.snapshot();
    console.info(
      JSON.stringify({
        source: 'create-booking-checkout-session',
        event: 'checkout_initiation_timing',
        timings,
        stay: extrasFamily === 'stay',
      })
    );
    return json({
      success: true,
      bookingId: targetBookingId,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      quotedTotal: totalAmount,
      currency,
      timings,
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
