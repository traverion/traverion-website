import { useState, useEffect, useLayoutEffect, useCallback, lazy, Suspense } from 'react';
import { ChunkLoadErrorBoundary } from './components/ChunkLoadErrorBoundary';
import UnifiedHeader from './components/UnifiedHeader';
import Footer from './components/Footer';
import SkipLink from './components/SkipLink';
import { TranslationProvider } from './contexts/TranslationContext';
import { SupplierAuthProvider } from './contexts/SupplierAuthContext';
import { SupplierRoleProvider } from './contexts/SupplierRoleContext';
import { AuthProvider } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import EmailVerifiedModal from './components/EmailVerifiedModal';
import {
  setPageMetaWithOg,
  setCanonicalUrl,
  setOrganizationJsonLd,
  setRobotsNoIndex,
  setPrivateAppRouteHead,
  removeCanonicalLink,
  clearOrganizationJsonLd,
} from './lib/seo';
import {
  isTourListingDeepLinkPath,
  normalizePublicListingDeepLinkPathname,
  normalizeLegacyBrochurePathname,
  normalizeRetiredCartPathname,
  parsePathname,
  shouldClearSelectedTour,
  mapStripeReturnRoute,
  navigateBackOrFallback,
} from './lib/appRouting';
import {
  normalizeLegacyTourUuidQueryParam,
  resolveTourListingIdFromSearch,
} from './lib/tour-listing-query';
import {
  buildPublicListingDeepLinkHref,
  resolvePublicListingDeepLinkTarget,
} from './lib/public-listing-deep-link';
import { STRIPE_TEST_UNTIL_LIVE } from './lib/booking-confirmation-copy';
import {
  isTraverionAdminHost,
  isPublicTraverionMarketingHost,
  redirectIfInAppAdminOnPublicMarketingSite,
} from './lib/adminHost';
import { getListingByIdAsync } from './data/listings';
import { listingIsFamily, listingIsOnTravelerCatalog } from './lib/inventory';
import { listingHasUpcomingBookableSeason } from './lib/booking-quote';
import { listingDetailVisibleToTraveler } from './lib/product-workflows';
import { isPartnerMarketingPathForCurrentHost, isPartnerPortalPathForCurrentHost } from './lib/partnerHost';
import {
  rememberProductReturn,
  isStaticConsumerPage,
  rememberListingReturn,
  listingBackLabel,
  consumeListingReturn,
  peekListingReturn,
  listingOriginHref,
  isProductDetailHistoryState,
} from './lib/navReturn';
import { failCloseOrphanStayCheckout } from './lib/marketplaceBrowse';
import { takeTravelerReturnStay } from './lib/travelerAuthLinks';
import {
  clearEmailVerifyNotice,
  emailConfirmHashNotice,
  isTravelerEmailConfirmLanding,
  immediateEmailVerifyNotice,
  peekEmailVerifyNotice,
  rememberEmailVerifyNotice,
  type EmailVerifyNotice,
} from './lib/emailVerifiedLanding';
import { settleTravelerEmailConfirm } from './lib/settleTravelerEmailConfirm';
import type { TourPackage as TourPackageType } from './types/tour';
import { SkeletonCardGrid, SkeletonPageHero } from './components/ui/Skeleton';
import { HERO_IMG } from './lib/heroImages';

const Blog = lazy(() => import('./pages/Blog'));
const BookingConfirmationPage = lazy(() => import('./pages/BookingConfirmationPage'));
const CheckoutUiPreview = lazy(() => import('./pages/dev/CheckoutUiPreview'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const Contact = lazy(() => import('./pages/Contact'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DestinationPage = lazy(() => import('./pages/DestinationPage'));
const AdminGate = lazy(() => import('./components/AdminGate'));
const AdminStaffLogin = lazy(() => import('./components/admin/AdminStaffLogin'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Cookies = lazy(() => import('./pages/Cookies'));
const About = lazy(() => import('./pages/About'));
const Sitemap = lazy(() => import('./pages/Sitemap'));
const LegalNotice = lazy(() => import('./pages/LegalNotice'));
const AffiliatePage = lazy(() => import('./pages/AffiliatePage'));
const ContentCreatorPage = lazy(() => import('./pages/ContentCreatorPage'));
const Packages = lazy(() => import('./pages/Packages'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const CartPage = lazy(() => import('./pages/CartPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const TourDetails = lazy(() => import('./pages/TourDetails'));
const Stays = lazy(() => import('./pages/Stays'));
const StayDetails = lazy(() => import('./pages/StayDetails'));
const ReservedInventoryPage = lazy(() => import('./pages/ReservedInventoryPage'));
const RentalDetails = lazy(() => import('./pages/RentalDetails'));
const RentalsCatalog = lazy(() => import('./pages/RentalsCatalog'));
const SupplierLayout = lazy(() => import('./components/supplier/SupplierLayout'));
const Home = lazy(() => import('./pages/Home'));

function PartnerRouteFallback() {
  return (
    <div className="min-h-screen bg-paper" aria-busy="true" aria-label="Loading">
      <p className="sr-only">Loading</p>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 pb-16">
        <div className="inline-flex items-center gap-2 rounded-2xl bg-finland/10 px-3 py-2 ring-1 ring-finland/15">
          <div className="h-6 w-6 rounded-md bg-finland/25 animate-pulse" aria-hidden />
          <div className="h-3 w-24 rounded bg-black/[0.06] animate-pulse" aria-hidden />
        </div>
        <div className="mt-10 h-10 w-56 max-w-full rounded-lg bg-black/[0.06] animate-pulse" />
        <div className="mt-3 h-4 w-72 max-w-full rounded bg-black/[0.04] animate-pulse" />
        <div className="mt-10 space-y-3">
          <div className="h-24 rounded-2xl bg-paper-raised shadow-soft ring-1 ring-black/[0.06] animate-pulse" />
          <div className="h-24 rounded-2xl bg-paper-raised shadow-soft ring-1 ring-black/[0.06] animate-pulse" />
          <div className="h-24 rounded-2xl bg-paper-raised shadow-soft ring-1 ring-black/[0.06] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-[50vh] bg-paper" aria-busy="true" aria-label="Loading">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <SkeletonPageHero />
        <div className="mt-10">
          <SkeletonCardGrid count={3} />
        </div>
      </div>
    </div>
  );
}

function readInitialRoute(): { page: string; destinationSlug: string | null } {
  if (typeof window === 'undefined') return { page: 'home', destinationSlug: null };
  if (isTraverionAdminHost()) {
    return parsePathname(window.location.pathname, { adminHost: true });
  }
  const path = normalizeRetiredCartPathname(
    normalizeLegacyBrochurePathname(normalizePublicListingDeepLinkPathname(window.location.pathname))
  );
  const parsed = parsePathname(path);
  let page = parsed.page;
  const { destinationSlug } = parsed;
  page = mapStripeReturnRoute(page, window.location.search);
  const params = new URLSearchParams(window.location.search);
  const tourParam = resolveTourListingIdFromSearch(window.location.search);
  const stayParam = params.get('stay');
  if (page === 'packages' && tourParam) {
    return { page: 'tour-details', destinationSlug };
  }
  if (page === 'stays' && stayParam && /^[0-9a-f-]{36}$/i.test(stayParam)) {
    return { page: 'stay-details', destinationSlug };
  }
  return { page, destinationSlug };
}

function App() {
  const initialRoute = readInitialRoute();
  const [currentPage, setCurrentPage] = useState(initialRoute.page);
  const [tourCheckoutOpen, setTourCheckoutOpen] = useState(false);
  const [destinationSlug, setDestinationSlug] = useState<string | null>(initialRoute.destinationSlug);
  const [selectedTour, setSelectedTour] = useState<TourPackageType | null>(null);
  // Partner portal: /login + /partner/* (and legacy /supplier* on localhost until migrated)
  const supplierPath =
    typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') || '/' : '';
  const isSupplierArea =
    isPartnerPortalPathForCurrentHost(supplierPath) ||
    isPartnerMarketingPathForCurrentHost(supplierPath) ||
    supplierPath === '/supplier-log-in' ||
    supplierPath === '/supplier' ||
    supplierPath.startsWith('/supplier/');
  const [emailVerifyNotice, setEmailVerifyNotice] = useState<EmailVerifyNotice | null>(() =>
    isSupplierArea || isTraverionAdminHost() ? null : immediateEmailVerifyNotice(),
  );
  // Sync internal route from the URL (initial load + browser back/forward)
  const syncRouteFromUrl = useCallback(() => {
    if (isSupplierArea) return;
    normalizeLegacyTourUuidQueryParam();
    const params = new URLSearchParams(window.location.search);
    const tourParam = resolveTourListingIdFromSearch(window.location.search);
    const adminHost = isTraverionAdminHost();
    const pathForParse = adminHost
      ? window.location.pathname
      : normalizeRetiredCartPathname(
          normalizeLegacyBrochurePathname(normalizePublicListingDeepLinkPathname(window.location.pathname))
        );
    const parsed = parsePathname(pathForParse, { adminHost });
    let page = parsed.page;
    const destinationSlug = parsed.destinationSlug;
    page = mapStripeReturnRoute(page, window.location.search);
    const stayParam = params.get('stay');
    if (!adminHost && page === 'packages' && tourParam) {
      page = 'tour-details';
    }
    if (!adminHost && page === 'stays' && stayParam && /^[0-9a-f-]{36}$/i.test(stayParam)) {
      page = 'stay-details';
    }
    setCurrentPage(page);
    setDestinationSlug(destinationSlug);
    const keepTourForDeepLink =
      !adminHost &&
      ((page === 'tour-details' && tourParam && /^[0-9a-f-]{36}$/i.test(tourParam)) ||
        (page === 'stay-details' && stayParam && /^[0-9a-f-]{36}$/i.test(stayParam)));
    if (shouldClearSelectedTour(page) && !keepTourForDeepLink) {
      setSelectedTour(null);
    }
  }, [isSupplierArea]);

  useEffect(() => {
    if (isSupplierArea) return;
    syncRouteFromUrl();
  }, [syncRouteFromUrl, isSupplierArea]);

  /**
   * Deep link: /packages?tour=<uuid>, /tour/<uuid>, /tours/<uuid> → TourDetails for tours;
   * stay rows on a tour URL rewrite to /stays?stay= and open StayDetails.
   * Canonical stay: /stays?stay=<uuid> (also /stay|stays/<uuid>).
   */
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) return;
    let cancelled = false;
    const run = () => {
      normalizePublicListingDeepLinkPathname(window.location.pathname);
      normalizeLegacyTourUuidQueryParam();
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      const stayParam = new URLSearchParams(window.location.search).get('stay');
      if (path === '/stays' && stayParam && /^[0-9a-f-]{36}$/i.test(stayParam)) {
        void getListingByIdAsync(stayParam).then((t) => {
          if (cancelled || !t) return;
          const target = resolvePublicListingDeepLinkTarget(t);
          if (!target || target.page !== 'stay-details') return;
          setSelectedTour(t);
          setCurrentPage('stay-details');
        });
        return;
      }
      const tourParam = resolveTourListingIdFromSearch(window.location.search);
      if (path !== '/packages' || !tourParam) return;
      void getListingByIdAsync(tourParam).then((t) => {
        if (cancelled || !t) return;
        const target = resolvePublicListingDeepLinkTarget(t);
        if (!target) return;
        setSelectedTour(t);
        setCurrentPage(target.page);
        if (target.page === 'stay-details') {
          const next = buildPublicListingDeepLinkHref(target, t.id, window.location.search);
          const cur = `${window.location.pathname}${window.location.search}`;
          if (cur !== next) {
            window.history.replaceState(window.history.state, '', next);
          }
        }
      });
    };
    run();
    window.addEventListener('popstate', run);
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', run);
    };
  }, [isSupplierArea]);

  /**
   * Confirmation links open the homepage and a modal. replaceState drops the verify URL
   * so Back cannot return to a separate verification screen.
   */
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) return;
    let cancelled = false;

    const show = (notice: EmailVerifyNotice) => {
      rememberEmailVerifyNotice(notice);
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      const search = window.location.search;
      const onHomeAlready = path === '/' && !search.includes('verified=1') && !window.location.hash;
      if (!onHomeAlready) window.history.replaceState({}, '', '/');
      setEmailVerifyNotice(notice);
      setCurrentPage('home');
    };

    const raw = window.location.hash?.replace(/^#/, '') ?? '';
    const hashNotice = emailConfirmHashNotice(raw);
    const landing = isTravelerEmailConfirmLanding();
    if (hashNotice && landing) {
      show(hashNotice);
      return;
    }
    if (!landing) {
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/') {
        const stored = peekEmailVerifyNotice();
        if (stored) setEmailVerifyNotice(stored);
      }
      return;
    }

    // Modal is already on screen. Keep the auth hash until the session is read, then drop the verify URL.
    void (async () => {
      const notice = await settleTravelerEmailConfirm();
      if (cancelled) return;
      if (notice === 'success') {
        rememberEmailVerifyNotice('success');
        window.history.replaceState({}, '', '/');
        return;
      }
      show(notice);
    })();

    return () => {
      cancelled = true;
    };
  }, [isSupplierArea]);

  /** Supabase puts confirm/recovery failures in the URL hash; redirect root loads would hide them. */
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) return;
    const raw = window.location.hash?.replace(/^#/, '') ?? '';
    if (!raw.includes('error=')) return;
    if (isTravelerEmailConfirmLanding()) return;
    const p = new URLSearchParams(raw);
    const code = p.get('error_code') ?? '';
    const desc = (p.get('error_description') ?? '').replace(/\+/g, ' ');
    const message =
      code === 'otp_expired'
        ? 'This confirmation link has expired or was already used. Use “Resend confirmation email” on the sign-in form, or sign up again.'
        : desc || 'This email link is invalid or has expired.';
    try {
      sessionStorage.setItem('traverion_auth_flash', JSON.stringify({ kind: 'error' as const, message }));
    } catch {
      /* ignore quota / private mode */
    }
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const onTravelerAuth =
      path === '/auth' || path === '/sign-up' || path === '/log-in' || path === '/email-confirmed';
    const qs = onTravelerAuth && window.location.search ? window.location.search : '?next=account';
    window.history.replaceState({}, '', `/log-in${qs}`);
    setCurrentPage('auth');
  }, [isSupplierArea]);

  useEffect(() => {
    if (isSupplierArea) return;
    const onPopState = () => syncRouteFromUrl();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [syncRouteFromUrl, isSupplierArea]);

  useLayoutEffect(() => {
    if (isSupplierArea) return;
    redirectIfInAppAdminOnPublicMarketingSite(currentPage);
  }, [currentPage, isSupplierArea]);

  // Update URL when page changes
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) {
      if (currentPage === 'admin-login' && window.location.pathname !== '/login') {
        window.history.replaceState({}, '', '/login');
      } else if (currentPage === 'admin-app' && window.location.pathname !== '/admin') {
        window.history.replaceState({}, '', '/admin');
      }
      return;
    }
    if (currentPage === 'tour-details') {
      if (selectedTour) {
        const params = new URLSearchParams(window.location.search);
        params.set('tour', selectedTour.id);
        params.delete('stay');
        const next = `/packages?${params.toString()}`;
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== next) {
          const prevState =
            typeof window.history.state === 'object' && window.history.state
              ? (window.history.state as Record<string, unknown>)
              : {};
          const nextState = { ...prevState, traverionProductDetail: selectedTour.id };
          if (isProductDetailHistoryState(window.history.state, selectedTour.id)) {
            window.history.replaceState(nextState, '', next);
          } else {
            window.history.pushState(nextState, '', next);
          }
        }
      }
      return;
    }
    if (currentPage === 'stay-details') {
      if (selectedTour) {
        const params = new URLSearchParams(window.location.search);
        params.set('stay', selectedTour.id);
        params.delete('tour');
        const next = `/stays?${params.toString()}`;
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== next) {
          const prevState =
            typeof window.history.state === 'object' && window.history.state
              ? (window.history.state as Record<string, unknown>)
              : {};
          const nextState = { ...prevState, traverionProductDetail: selectedTour.id };
          if (isProductDetailHistoryState(window.history.state, selectedTour.id)) {
            window.history.replaceState(nextState, '', next);
          } else {
            window.history.pushState(nextState, '', next);
          }
        }
      }
      return;
    }
    if (currentPage === 'packages') {
      normalizePublicListingDeepLinkPathname(window.location.pathname);
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path !== '/packages' && !isTourListingDeepLinkPath(path)) {
        window.history.replaceState(window.history.state, '', '/packages');
        return;
      }
      const current = `${window.location.pathname}${window.location.search}`;
      const qs = new URLSearchParams(window.location.search).toString();
      const next = qs ? `/packages?${qs}` : '/packages';
      if (current !== next && window.location.pathname === '/packages') {
        window.history.replaceState({}, '', next);
      }
      return;
    }
    if (currentPage === 'stays') {
      normalizePublicListingDeepLinkPathname(window.location.pathname);
      if (window.location.pathname !== '/stays') {
        window.history.replaceState({}, '', `/stays${window.location.search}`);
      }
      return;
    }
    if (currentPage === 'rentals') {
      if (window.location.pathname !== '/rentals') {
        window.history.replaceState({}, '', `/rentals${window.location.search}`);
      }
      return;
    }
    if (currentPage === 'rental-details') {
      const id =
        destinationSlug && /^[0-9a-f-]{36}$/i.test(destinationSlug)
          ? destinationSlug
          : window.location.pathname.match(/^\/rentals\/([0-9a-f-]{36})$/i)?.[1];
      if (id && window.location.pathname !== `/rentals/${id}`) {
        window.history.replaceState(window.history.state, '', `/rentals/${id}`);
      }
      return;
    }
    if (currentPage === 'inventory-reserved') {
      if (window.location.pathname !== '/experiences') {
        window.history.replaceState(window.history.state, '', '/experiences');
      }
      return;
    }
    if (
      currentPage === 'auth' ||
      currentPage === 'email-confirmed' ||
      currentPage === 'not-found' ||
      currentPage === 'reset-password'
    ) {
      return;
    }
    const urlMapping: { [key: string]: string } = {
      'packages': '/packages',
      'stays': '/stays',
      'auth': '/auth',
      'account': '/account',
      'wishlist': '/wishlist',
      'bookings': '/bookings',
      'cart': '/cart',
      'booking-confirmed': '/booking-confirmed',
      'checkout-ui-preview': '/checkout-ui-preview',
      'blog': '/blog',
      'contact': '/contact',
      'admin': '/admin',
      'privacy': '/privacy',
      'terms': '/terms',
      'cookies': '/cookies',
      'about': '/about',
      'sitemap': '/sitemap',
      'legal-notice': '/legal-notice',
      'affiliate': '/affiliate',
      'content-creator': '/content-creator',
      'home': '/'
    };

    const pathNow = window.location.pathname.replace(/\/$/, '') || '/';
    const hashNow = window.location.hash;
    if (
      pathNow === '/email-confirmed' ||
      pathNow === '/email-verified' ||
      hashNow.includes('access_token=') ||
      hashNow.includes('refresh_token=') ||
      hashNow.includes('error=') ||
      new URLSearchParams(window.location.search).get('verified') === '1'
    ) {
      return;
    }

    const newUrl =
      currentPage === 'destination'
        ? `/destinations/${destinationSlug || ''}`
        : (urlMapping[currentPage] ?? '/');
    if (window.location.pathname !== newUrl) {
      const keepSearch =
        currentPage === 'checkout-ui-preview' || currentPage === 'booking-confirmed'
          ? window.location.search
          : '';
      window.history.replaceState({}, '', `${newUrl}${keepSearch}`);
    }
  }, [currentPage, destinationSlug, selectedTour, isSupplierArea]);

  // Scroll to top when page changes
  useEffect(() => {
    if (isSupplierArea) return;
    window.scrollTo(0, 0);
  }, [currentPage, isSupplierArea]);

  // Organization JSON-LD once on mount (not on staff subdomain — avoid linking private host to brand graph)
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) return;
    setOrganizationJsonLd();
  }, [isSupplierArea]);

  // Document title, meta, OG/Twitter, and canonical URL per page
  useEffect(() => {
    if (isSupplierArea) return;

    const privateStaffPage =
      currentPage === 'admin' || currentPage === 'admin-login' || currentPage === 'admin-app';
    if (privateStaffPage) {
      clearOrganizationJsonLd();
      const title = currentPage === 'admin-app' ? 'Dashboard' : 'Sign in';
      setPrivateAppRouteHead(title, 'Private access.');
      setRobotsNoIndex(true);
      removeCanonicalLink();
      return;
    }

    // Phase 1282: indexable deep-link head only when the listing is traveler-visible
    // (and tours still have an upcoming season) — TourDetails 1271 / StayDetails 1273 parity.
    const stayDeepLinkOk =
      currentPage === 'stay-details' &&
      !!selectedTour &&
      listingDetailVisibleToTraveler({
        familyMatches: listingIsFamily(selectedTour, 'stay'),
        status: selectedTour.status,
      });
    const tourDeepLinkOk =
      (currentPage === 'tour-details' || currentPage === 'booking') &&
      !!selectedTour &&
      listingDetailVisibleToTraveler({
        familyMatches: listingIsOnTravelerCatalog(selectedTour),
        status: selectedTour.status,
      }) &&
      listingHasUpcomingBookableSeason(selectedTour);
    if (stayDeepLinkOk || tourDeepLinkOk) {
      const deepLinkTitle =
        currentPage === 'stay-details' ? selectedTour!.title || 'Stay' : selectedTour!.title || 'Tour';
      const desc =
        currentPage === 'stay-details'
          ? 'Apartment or room from an independent operator.'
          : 'Book this tour from an independent operator.';
      setPageMetaWithOg(deepLinkTitle, desc);
      setRobotsNoIndex(false);
      const path = currentPage === 'stay-details' ? `/stays/${selectedTour!.id}` : `/tours/${selectedTour!.id}`;
      setCanonicalUrl(path);
      return;
    }
    if (
      currentPage === 'tour-details' ||
      currentPage === 'booking' ||
      currentPage === 'stay-details'
    ) {
      const desc =
        currentPage === 'stay-details'
          ? 'Apartment or room from an independent operator.'
          : 'Book this tour from an independent operator.';
      setPageMetaWithOg(currentPage === 'stay-details' ? 'Stay' : 'Tour', desc);
      setRobotsNoIndex(true);
      removeCanonicalLink();
      return;
    }

    const metaByPage: Record<string, { title: string; description?: string }> = {
      home: { title: '', description: 'Book tours and stays worldwide from independent operators. Cancellation follows each listing.' },
      packages: { title: 'Tours', description: 'Browse and book tours worldwide. Filter by destination, price, dates, and tags. Cancellation follows each listing.' },
      stays: { title: 'Stays', description: 'Apartments and rooms from independent operators. Cancellation follows each listing.' },
      rentals: {
        title: 'Rentals',
        description: 'Rent bikes, winter clothing, skis, and outdoor equipment from independent operators.',
      },
      'rental-details': {
        title: 'Rental',
        description: 'Rent equipment from an independent operator. Cancellation follows each listing.',
      },
      auth: { title: 'Sign in', description: 'Sign in or create an account to manage your bookings.' },
      'reset-password': { title: 'Set a new password', description: 'Choose a new password for your Traverion traveler account.' },
      'email-confirmed': { title: 'Email confirmed', description: 'Your Traverion traveler email was verified.' },
      account: { title: 'My account', description: 'Your profile, trips, and saved tours and stays.' },
      wishlist: { title: 'Saved', description: 'Tours and stays you have saved.' },
      bookings: { title: 'My bookings', description: 'View your confirmed tours and stays.' },
      cart: { title: 'Cart', description: 'Open checkouts you can finish — nights are not reserved until payment succeeds.' },
      'booking-confirmed': {
        title: 'Booking confirmed',
        description: `Your tour or stay payment was successful. Checkout used ${STRIPE_TEST_UNTIL_LIVE}.`,
      },
      blog: { title: 'Stories coming later', description: 'Traverion is not publishing editorial articles yet.' },
      contact: { title: 'Contact', description: 'Get in touch with Traverion.' },
      privacy: { title: 'Privacy Policy', description: 'Traverion privacy policy.' },
      terms: { title: 'Terms of Service', description: 'Traverion terms of service.' },
      cookies: { title: 'Cookies and marketing preferences', description: 'What cookies Traverion uses and how you can control analytics and marketing signals.' },
      about: { title: 'About Us', description: 'Learn about Traverion.' },
      sitemap: { title: 'Sitemap', description: 'All pages and links.' },
      'legal-notice': { title: 'Legal notice', description: 'Traverion operator information and legal contacts.' },
      affiliate: { title: 'Affiliate program', description: 'Apply to partner with Traverion. Commission terms begin after approval.' },
      'content-creator': { title: 'Content creators', description: 'Apply to collaborate with Traverion on travel content.' },
      destination: { title: 'Destination', description: 'Tours and stays in this destination from live operators.' },
      'inventory-reserved': {
        title: 'Experiences',
        description: 'Experiences is a reserved category, not mixed into Tours.',
      },
      'not-found': { title: 'Page not found', description: 'This address is not a Traverion page.' },
    };
    const meta = metaByPage[currentPage];
    if (meta) setPageMetaWithOg(meta.title, meta.description);
    else setPageMetaWithOg('Traverion', 'Tours and stays worldwide.');

    setRobotsNoIndex(
      currentPage === 'booking-confirmed' ||
        currentPage === 'reset-password' ||
        currentPage === 'not-found'
    );

    const pathMap: Record<string, string> = {
      home: '/', packages: '/packages', stays: '/stays', auth: '/auth', 'reset-password': '/set-password', 'email-confirmed': '/email-confirmed', account: '/account', wishlist: '/wishlist', bookings: '/bookings', cart: '/cart',
      'booking-confirmed': '/booking-confirmed',
      blog: '/blog', contact: '/contact', privacy: '/privacy', terms: '/terms', cookies: '/cookies',
      about: '/about', sitemap: '/sitemap',
      'legal-notice': '/legal-notice', affiliate: '/affiliate', 'content-creator': '/content-creator',
    };
    const path =
      currentPage === 'destination'
        ? `/destinations/${destinationSlug || ''}`
        : currentPage === 'rentals'
          ? '/rentals'
          : currentPage === 'rental-details'
            ? `/rentals/${destinationSlug || ''}`
        : currentPage === 'inventory-reserved'
          ? '/experiences'
          : currentPage === 'not-found'
            ? window.location.pathname
          : (pathMap[currentPage] ?? '/');
    setCanonicalUrl(path);
  }, [currentPage, destinationSlug, isSupplierArea, selectedTour]);

  const handleNavigate = useCallback((page: string) => {
    if (isStaticConsumerPage(page) && !isStaticConsumerPage(currentPage)) {
      rememberProductReturn(currentPage, `${window.location.pathname}${window.location.search}`);
    }
    if (page.startsWith('destinations/') || page.startsWith('/destinations/')) {
      const slug = page.replace(/^\/?destinations\//, '').split(/[?#]/)[0] || null;
      setDestinationSlug(slug);
      setCurrentPage('destination');
      return;
    }
    if (page === 'stays') {
      const returnStay = takeTravelerReturnStay();
      if (returnStay) {
        const params = new URLSearchParams();
        params.set('stay', returnStay.id);
        const stayDates = failCloseOrphanStayCheckout(returnStay.checkIn ?? '', returnStay.checkOut ?? '');
        if (stayDates.checkIn) {
          params.set('date', stayDates.checkIn);
          if (stayDates.checkOut) params.set('checkout', stayDates.checkOut);
        }
        if (returnStay.guests) params.set('guests', String(returnStay.guests));
        window.history.replaceState({}, '', `/stays?${params.toString()}`);
        void getListingByIdAsync(returnStay.id).then((t) => {
          if (
            !t ||
            !listingDetailVisibleToTraveler({ familyMatches: listingIsFamily(t, 'stay'), status: t.status })
          ) {
            setCurrentPage('stays');
            return;
          }
          setSelectedTour(t);
          setCurrentPage('stay-details');
        });
        return;
      }
    }
    if (page === 'cart') {
      setCurrentPage('bookings');
      return;
    }
    if (page === 'auth') {
      const next = `/log-in?next=${encodeURIComponent(
        currentPage === 'auth' ? 'home' : currentPage === 'packages' ? 'packages' : currentPage
      )}`;
      const cur = `${window.location.pathname}${window.location.search}`;
      if (cur !== next) {
        window.history.pushState({}, '', next);
      }
      setCurrentPage('auth');
      return;
    }
    setCurrentPage(page);
  }, [currentPage]);

  const handleTourSelect = (tour: TourPackageType) => {
    const origin = listingOriginHref(
      currentPage,
      window.location.pathname,
      window.location.search
    );
    const here = `${window.location.pathname}${window.location.search}`;
    if (here !== origin) {
      const prev =
        typeof window.history.state === 'object' && window.history.state
          ? { ...(window.history.state as Record<string, unknown>) }
          : {};
      delete prev.traverionProductDetail;
      window.history.replaceState({ ...prev, traverionPage: currentPage }, '', origin);
    }
    rememberListingReturn(currentPage, origin, true);
    if (listingIsFamily(tour, 'stay')) {
      if (
        tour.title &&
        !listingDetailVisibleToTraveler({ familyMatches: true, status: tour.status })
      ) {
        return;
      }
      setSelectedTour(tour);
      setCurrentPage('stay-details');
      // Hydrate full stay row when My bookings only passed an id + family hint.
      if (!tour.title) {
        void getListingByIdAsync(tour.id).then((full) => {
          if (
            !full ||
            !listingDetailVisibleToTraveler({ familyMatches: listingIsFamily(full, 'stay'), status: full.status })
          ) {
            return;
          }
          setSelectedTour(full);
        });
      }
      return;
    }
    if (listingIsFamily(tour, 'rental')) {
      if (
        tour.title &&
        !listingDetailVisibleToTraveler({ familyMatches: true, status: tour.status })
      ) {
        return;
      }
      setSelectedTour(tour);
      setDestinationSlug(tour.id);
      setCurrentPage('rental-details');
      window.history.pushState({ traverionPage: 'rental-details' }, '', `/rentals/${tour.id}`);
      if (!tour.title) {
        void getListingByIdAsync(tour.id).then((full) => {
          if (
            !full ||
            !listingDetailVisibleToTraveler({
              familyMatches: listingIsFamily(full, 'rental'),
              status: full.status,
            })
          ) {
            return;
          }
          setSelectedTour(full);
        });
      }
      return;
    }
    if (!tour.title) {
      void getListingByIdAsync(tour.id).then((full) => {
        if (!full) return;
        if (listingIsFamily(full, 'stay')) {
          if (
            !listingDetailVisibleToTraveler({ familyMatches: true, status: full.status })
          ) {
            return;
          }
          setSelectedTour(full);
          setCurrentPage('stay-details');
          return;
        }
        if (listingIsFamily(full, 'rental')) {
          if (
            !listingDetailVisibleToTraveler({ familyMatches: true, status: full.status })
          ) {
            return;
          }
          setSelectedTour(full);
          setDestinationSlug(full.id);
          setCurrentPage('rental-details');
          window.history.pushState({ traverionPage: 'rental-details' }, '', `/rentals/${full.id}`);
          return;
        }
        if (
          !listingDetailVisibleToTraveler({
            familyMatches: listingIsOnTravelerCatalog(full),
            status: full.status,
          }) ||
          !listingHasUpcomingBookableSeason(full)
        ) {
          return;
        }
        setSelectedTour(full);
        setCurrentPage('tour-details');
      });
      return;
    }
    if (
      !listingDetailVisibleToTraveler({
        familyMatches: listingIsFamily(tour, 'tour'),
        status: tour.status,
      }) ||
      !listingHasUpcomingBookableSeason(tour)
    ) {
      return;
    }
    setSelectedTour(tour);
    setCurrentPage('tour-details');
  };

  const applyListingReturn = (kind: 'tour' | 'stay', ret: { page: string; href: string } | null) => {
    setSelectedTour(null);
    if (ret?.href && ret.href.startsWith('/') && !ret.href.startsWith('//')) {
      window.history.replaceState({ traverionPage: ret.page }, '', ret.href);
      setCurrentPage(ret.page === 'booking' ? 'packages' : ret.page);
      return;
    }
    if (kind === 'stay') {
      setCurrentPage('stays');
      window.history.replaceState({ traverionPage: 'stays' }, '', '/stays');
      return;
    }
    setCurrentPage('packages');
    window.history.replaceState({ traverionPage: 'packages' }, '', '/packages');
  };

  const leaveListing = (kind: 'tour' | 'stay') => {
    const ret = peekListingReturn();
    if (!ret) {
      applyListingReturn(kind, null);
      return;
    }
    consumeListingReturn();
    if (!ret.pushed) {
      applyListingReturn(kind, ret);
      return;
    }
    const before = `${window.location.pathname}${window.location.search}`;
    window.history.back();
    window.setTimeout(() => {
      const after = `${window.location.pathname}${window.location.search}`;
      if (after === before || after !== ret.href) {
        applyListingReturn(kind, ret);
      } else {
        setSelectedTour(null);
      }
    }, 200);
  };

  const handleBackToStays = () => {
    leaveListing('stay');
  };

  const handleBackFromDestination = () => {
    navigateBackOrFallback(() => {
      setCurrentPage('home');
      window.history.replaceState({}, '', '/');
    });
  };

  const handleBackToTours = () => {
    leaveListing('tour');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onTourSelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'packages':
        return <Packages onTourSelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'stays':
        return <Stays onStaySelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'stay-details': {
        const stayId =
          selectedTour?.id ?? new URLSearchParams(window.location.search).get('stay') ?? '';
        if (/^[0-9a-f-]{36}$/i.test(stayId)) {
          return (
            <StayDetails
              stayId={stayId}
              onBack={handleBackToStays}
              backLabel={listingBackLabel('Stays')}
            />
          );
        }
        return (
          <div className="min-h-[50vh] bg-paper" aria-busy="true" aria-label="Loading stay">
            <RouteFallback />
          </div>
        );
      }
      case 'rentals':
        return (
          <RentalsCatalog
            onNavigate={handleNavigate}
            onOpenListing={(id) => {
              window.history.pushState({ traverionPage: 'rental-details' }, '', `/rentals/${id}`);
              setDestinationSlug(id);
              setCurrentPage('rental-details');
            }}
          />
        );
      case 'rental-details': {
        const rentalId =
          (destinationSlug && /^[0-9a-f-]{36}$/i.test(destinationSlug) ? destinationSlug : null) ??
          (typeof window !== 'undefined'
            ? window.location.pathname.match(/^\/rentals\/([0-9a-f-]{36})$/i)?.[1] ?? null
            : null);
        if (!rentalId) {
          return (
            <RentalsCatalog
              onNavigate={handleNavigate}
              onOpenListing={(id) => {
                window.history.pushState({ traverionPage: 'rental-details' }, '', `/rentals/${id}`);
                setDestinationSlug(id);
                setCurrentPage('rental-details');
              }}
            />
          );
        }
        return <RentalDetails listingId={rentalId} onNavigate={handleNavigate} />;
      }
      case 'inventory-reserved':
        return <ReservedInventoryPage family="experience" onNavigate={handleNavigate} />;
      case 'destination':
        return (
          <DestinationPage
            slug={destinationSlug}
            onTourSelect={handleTourSelect}
            onBack={handleBackFromDestination}
            onNavigate={handleNavigate}
          />
        );
      case 'blog':
        return <Blog onNavigate={handleNavigate} />;
      case 'tour-details':
      case 'booking': {
        const tourId =
          selectedTour?.id ?? resolveTourListingIdFromSearch(window.location.search) ?? '';
        if (/^[0-9a-f-]{36}$/i.test(tourId)) {
          return (
            <TourDetails
              tourId={tourId}
              onBack={handleBackToTours}
              backLabel={listingBackLabel('Tours')}
              onCheckoutActive={setTourCheckoutOpen}
            />
          );
        }
        return (
          <div className="min-h-[50vh] bg-paper" aria-busy="true" aria-label="Loading tour">
            <RouteFallback />
          </div>
        );
      }
      case 'account':
        return <AccountPage onNavigate={handleNavigate} />;
      case 'wishlist':
        return (
          <WishlistPage
            onNavigate={handleNavigate}
            onTourSelect={(t) => handleTourSelect(t as TourPackageType)}
          />
        );
      case 'auth':
        return <AuthPage onNavigate={handleNavigate} />;
      case 'reset-password':
        return <ResetPasswordPage onNavigate={handleNavigate} />;
      case 'email-confirmed':
        return <Home onTourSelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'cart':
        return <CartPage onNavigate={handleNavigate} />;
      case 'bookings':
        return (
          <MyBookings
            onNavigate={handleNavigate}
            onTourSelect={(t) => handleTourSelect(t as TourPackageType)}
          />
        );
      case 'booking-confirmed':
        return <BookingConfirmationPage onNavigate={handleNavigate} />;
      case 'checkout-ui-preview':
        return import.meta.env.DEV ? <CheckoutUiPreview /> : null;
      case 'contact':
        return <Contact onNavigate={handleNavigate} />;
      case 'legal-notice':
        return <LegalNotice onNavigate={handleNavigate} />;
      case 'affiliate':
        return <AffiliatePage onNavigate={handleNavigate} />;
      case 'content-creator':
        return <ContentCreatorPage onNavigate={handleNavigate} />;
      case 'privacy':
        return <Privacy onNavigate={handleNavigate} />;
      case 'terms':
        return <Terms onNavigate={handleNavigate} />;
      case 'cookies':
        return <Cookies onNavigate={handleNavigate} />;
      case 'about':
        return <About onNavigate={handleNavigate} />;
      case 'sitemap':
        return <Sitemap onNavigate={handleNavigate} />;
      case 'admin':
        if (typeof window !== 'undefined' && isPublicTraverionMarketingHost()) {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-paper text-ink-muted">
              <p className="text-sm">Redirecting…</p>
            </div>
          );
        }
        return <AdminGate mode="gate" />;
      case 'admin-login':
        return <AdminStaffLogin />;
      case 'admin-app':
        return <AdminGate mode="dashboard-only" />;
      case 'not-found':
        return (
          <div className="min-h-screen bg-paper tv-page">
            <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20">
              <div className="overflow-hidden rounded-2xl bg-paper-raised shadow-soft-lg ring-1 ring-black/[0.06]">
                <div className="relative h-40 sm:h-48">
                  <img
                    src={HERO_IMG.vacation}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    width={1200}
                    height={480}
                    decoding="async"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-finland-dark/80 via-finland/40 to-ink/20"
                    aria-hidden
                  />
                  <div className="relative z-10 flex h-full flex-col justify-end p-5 sm:p-7">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">404</p>
                    <h1 className="font-display text-3xl sm:text-4xl text-white tracking-tight">Page not found</h1>
                  </div>
                </div>
                <div className="p-5 sm:p-7">
                  <p className="text-sm text-ink-muted leading-relaxed max-w-lg">
                    This address is not a Traverion page. Continue from Home, or browse live tours and stays from
                    operators.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button type="button" className="tv-btn-primary" onClick={() => handleNavigate('home')}>
                      Go home
                    </button>
                    <button type="button" className="tv-btn-secondary" onClick={() => handleNavigate('packages')}>
                      Browse tours
                    </button>
                    <button type="button" className="tv-btn-ghost" onClick={() => handleNavigate('stays')}>
                      Browse stays
                    </button>
                    <button type="button" className="tv-btn-ghost" onClick={() => handleNavigate('contact')}>
                      Contact support
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return <Home onTourSelect={handleTourSelect} onNavigate={handleNavigate} />;
    }
  };

  if (isSupplierArea) {
    return (
      <TranslationProvider>
        <AuthProvider>
          <SupplierAuthProvider>
            <SupplierRoleProvider>
              <ChunkLoadErrorBoundary resetKey="supplier">
                <Suspense fallback={<PartnerRouteFallback />}>
                  <SupplierLayout />
                </Suspense>
              </ChunkLoadErrorBoundary>
            </SupplierRoleProvider>
          </SupplierAuthProvider>
        </AuthProvider>
      </TranslationProvider>
    );
  }

  const staffShell =
    currentPage === 'admin' ||
    currentPage === 'admin-login' ||
    currentPage === 'admin-app' ||
    isTraverionAdminHost();

  const minimalTravelerChrome =
    currentPage === 'booking-confirmed' ||
    currentPage === 'checkout-ui-preview' ||
    currentPage === 'reset-password' ||
    currentPage === 'auth';

  return (
    <TranslationProvider>
      <AuthProvider>
        {staffShell ? (
          <>
            <ChunkLoadErrorBoundary resetKey={currentPage}>
              <Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>
            </ChunkLoadErrorBoundary>
            <AuthModal />
          </>
        ) : minimalTravelerChrome ? (
          <div key={currentPage} className="min-h-screen bg-paper lux-page-enter lux-page-enter--slide">
            <ChunkLoadErrorBoundary resetKey={currentPage}>
              <Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>
            </ChunkLoadErrorBoundary>
            <AuthModal />
          </div>
        ) : (
          <div className="min-h-screen bg-paper relative flex flex-col">
            <SkipLink />
            {tourCheckoutOpen ? null : (
              <UnifiedHeader currentPage={currentPage} onNavigate={handleNavigate} />
            )}
            <main id="main-content" tabIndex={-1} className="flex-grow min-w-0 outline-none">
              <div key={currentPage} className="min-h-[min(50vh,480px)]">
                <ChunkLoadErrorBoundary resetKey={currentPage}>
                  <Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>
                </ChunkLoadErrorBoundary>
              </div>
            </main>
            {tourCheckoutOpen ? null : <Footer onNavigate={handleNavigate} />}
            <AuthModal />
          </div>
        )}
        {emailVerifyNotice && !staffShell ? (
          <EmailVerifiedModal
            notice={emailVerifyNotice}
            onClose={() => {
              clearEmailVerifyNotice();
              setEmailVerifyNotice(null);
              if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
                window.history.replaceState({}, '', '/');
              }
              setCurrentPage('home');
            }}
          />
        ) : null}
      </AuthProvider>
    </TranslationProvider>
  );
}

export default App;
