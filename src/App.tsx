import { useState, useEffect, useLayoutEffect, useCallback, lazy, Suspense } from 'react';
import UnifiedHeader from './components/UnifiedHeader';
import Footer from './components/Footer';
import SkipLink from './components/SkipLink';
import ErrorState from './components/ErrorState';
import Home from './pages/Home';
import { TranslationProvider } from './contexts/TranslationContext';
import { SupplierAuthProvider } from './contexts/SupplierAuthContext';
import { AuthProvider } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
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
  normalizePublicTourDeepLinkPathname,
  normalizeLegacyBrochurePathname,
  parsePathname,
  shouldClearSelectedTour,
  mapStripeReturnRoute,
} from './lib/appRouting';
import {
  isTraverionAdminHost,
  isPublicTraverionMarketingHost,
  redirectIfInAppAdminOnPublicMarketingSite,
} from './lib/adminHost';
import { getListingByIdAsync } from './data/listings';
import { listingIsFamily, listingIsOnTravelerCatalog } from './lib/inventory';
import { isPartnerMarketingPathForCurrentHost, isPartnerPortalPathForCurrentHost } from './lib/partnerHost';
import { rememberProductReturn, isStaticConsumerPage } from './lib/navReturn';
import { takeTravelerReturnStay } from './lib/travelerAuthLinks';
import type { TourPackage as TourPackageType } from './types/tour';
import { SkeletonCardGrid, SkeletonPageHero } from './components/ui/Skeleton';

const Blog = lazy(() => import('./pages/Blog'));
const BookingConfirmationPage = lazy(() => import('./pages/BookingConfirmationPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const Contact = lazy(() => import('./pages/Contact'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const EmailConfirmedSuccess = lazy(() => import('./pages/EmailConfirmedSuccess'));
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
const AuthPage = lazy(() => import('./pages/AuthPage'));
const TourDetails = lazy(() => import('./pages/TourDetails'));
const Stays = lazy(() => import('./pages/Stays'));
const StayDetails = lazy(() => import('./pages/StayDetails'));
const ReservedInventoryPage = lazy(() => import('./pages/ReservedInventoryPage'));
const SupplierLayout = lazy(() => import('./components/supplier/SupplierLayout'));

function PartnerRouteFallback() {
  return (
    <div className="min-h-screen bg-paper" aria-busy="true" aria-label="Loading">
      <p className="sr-only">Loading</p>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10">
        <div className="h-10 w-48 rounded-lg bg-black/[0.06] animate-pulse" />
        <div className="mt-8 h-24 rounded-2xl bg-black/[0.04] animate-pulse" />
        <div className="mt-4 h-24 rounded-2xl bg-black/[0.04] animate-pulse" />
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
  const path = normalizeLegacyBrochurePathname(normalizePublicTourDeepLinkPathname(window.location.pathname));
  const parsed = parsePathname(path);
  let page = parsed.page;
  const { destinationSlug } = parsed;
  page = mapStripeReturnRoute(page, window.location.search);
  const params = new URLSearchParams(window.location.search);
  const tourParam = params.get('tour');
  const stayParam = params.get('stay');
  if (page === 'packages' && tourParam && /^[0-9a-f-]{36}$/i.test(tourParam)) {
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
  // Sync internal route from the URL (initial load + browser back/forward)
  const syncRouteFromUrl = useCallback(() => {
    if (isSupplierArea) return;
    const params = new URLSearchParams(window.location.search);
    const tourParam = params.get('tour');
    const adminHost = isTraverionAdminHost();
    const pathForParse = adminHost
      ? window.location.pathname
      : normalizeLegacyBrochurePathname(normalizePublicTourDeepLinkPathname(window.location.pathname));
    const parsed = parsePathname(pathForParse, { adminHost });
    let page = parsed.page;
    const destinationSlug = parsed.destinationSlug;
    page = mapStripeReturnRoute(page, window.location.search);
    const stayParam = params.get('stay');
    if (!adminHost && page === 'packages' && tourParam && /^[0-9a-f-]{36}$/i.test(tourParam)) {
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

  /** Deep link: /packages?tour=<uuid> or /tour/<uuid> (rewritten) opens TourDetails (supplier “View on site” links). */
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) return;
    let cancelled = false;
    const run = () => {
      normalizePublicTourDeepLinkPathname(window.location.pathname);
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      const stayParam = new URLSearchParams(window.location.search).get('stay');
      if (path === '/stays' && stayParam && /^[0-9a-f-]{36}$/i.test(stayParam)) {
        void getListingByIdAsync(stayParam).then((t) => {
          if (cancelled || !t) return;
          setSelectedTour(t);
          setCurrentPage('stay-details');
        });
        return;
      }
      const tourParam = new URLSearchParams(window.location.search).get('tour');
      if (path !== '/packages' || !tourParam || !/^[0-9a-f-]{36}$/i.test(tourParam)) return;
      void getListingByIdAsync(tourParam).then((t) => {
        if (cancelled || !t) return;
        setSelectedTour(t);
        setCurrentPage('tour-details');
      });
    };
    run();
    window.addEventListener('popstate', run);
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', run);
    };
  }, [isSupplierArea]);

  /** Supabase puts confirm/recovery failures in the URL hash; redirect root loads would hide them. */
  useEffect(() => {
    if (isSupplierArea) return;
    if (isTraverionAdminHost()) return;
    const raw = window.location.hash?.replace(/^#/, '') ?? '';
    if (!raw.includes('error=')) return;
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
        const next = `/packages?${params.toString()}`;
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== next) {
          window.history.replaceState({}, '', next);
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
          window.history.replaceState({}, '', next);
        }
      }
      return;
    }
    if (currentPage === 'packages') {
      normalizePublicTourDeepLinkPathname(window.location.pathname);
      const current = `${window.location.pathname}${window.location.search}`;
      const qs = new URLSearchParams(window.location.search).toString();
      const next = qs ? `/packages?${qs}` : '/packages';
      if (current !== next && window.location.pathname === '/packages') {
        window.history.replaceState({}, '', next);
      }
      return;
    }
    if (currentPage === 'stays') {
      if (window.location.pathname !== '/stays') {
        window.history.replaceState({}, '', `/stays${window.location.search}`);
      }
      return;
    }
    if (currentPage === 'inventory-reserved') {
      if (window.location.pathname !== '/experiences') {
        window.history.replaceState({}, '', '/experiences');
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
      'cart': '/cart',
      'auth': '/auth',
      'account': '/account',
      'wishlist': '/wishlist',
      'bookings': '/bookings',
      'booking-confirmed': '/booking-confirmed',
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

    const newUrl =
      currentPage === 'destination'
        ? `/destinations/${destinationSlug || ''}`
        : (urlMapping[currentPage] ?? '/');
    if (window.location.pathname !== newUrl) {
      window.history.replaceState({}, '', newUrl);
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

    const metaByPage: Record<string, { title: string; description?: string }> = {
      home: { title: 'Traverion', description: 'Book tours and activities worldwide. Find and reserve experiences with free cancellation.' },
      packages: { title: 'Tours', description: 'Browse and book tours worldwide. Filter by destination, price, and more.' },
      stays: { title: 'Stays', description: 'Apartments and rooms from independent operators.' },
      auth: { title: 'Sign in', description: 'Sign in or create an account to manage your bookings and cart.' },
      'reset-password': { title: 'Set a new password', description: 'Choose a new password for your Traverion traveler account.' },
      'email-confirmed': { title: 'Email confirmed', description: 'Your Traverion traveler email was verified.' },
      cart: { title: 'Cart', description: 'Your cart. Request bookings for selected tours.' },
      account: { title: 'My account', description: 'Your bookings, wishlist, and cart in one place.' },
      wishlist: { title: 'Wishlist', description: 'Tours and activities you have saved.' },
      bookings: { title: 'My bookings', description: 'View your tour and activity reservations and their status.' },
      'booking-confirmed': { title: 'Booking confirmed', description: 'Your tour payment was successful.' },
      blog: { title: 'Stories coming later', description: 'Traverion is not publishing editorial articles yet.' },
      contact: { title: 'Contact', description: 'Get in touch with Traverion.' },
      privacy: { title: 'Privacy Policy', description: 'Traverion privacy policy.' },
      terms: { title: 'Terms of Service', description: 'Traverion terms of service.' },
      cookies: { title: 'Cookie Policy', description: 'Traverion cookie policy.' },
      about: { title: 'About Us', description: 'Learn about Traverion.' },
      sitemap: { title: 'Sitemap', description: 'All pages and links.' },
      'legal-notice': { title: 'Legal notice', description: 'Traverion operator information and legal contacts.' },
      affiliate: { title: 'Affiliate program', description: 'Partner with Traverion and earn commissions.' },
      'content-creator': { title: 'Content creators', description: 'Collaborate with Traverion on travel content.' },
      destination: { title: 'Destination', description: 'Tours and activities in this destination.' },
      'inventory-reserved': {
        title: 'Experiences',
        description: 'Experiences is a reserved category, not mixed into Tours.',
      },
      'not-found': { title: 'Page not found', description: 'This address is not a Traverion page.' },
    };
    const meta = metaByPage[currentPage];
    if (meta) setPageMetaWithOg(meta.title, meta.description);
    else setPageMetaWithOg('Traverion', 'Tours worldwide.');

    setRobotsNoIndex(
      currentPage === 'booking-confirmed' || currentPage === 'reset-password' || currentPage === 'not-found'
    );

    const pathMap: Record<string, string> = {
      home: '/', packages: '/packages', stays: '/stays', auth: '/auth', 'reset-password': '/set-password', 'email-confirmed': '/email-confirmed', cart: '/cart', account: '/account', wishlist: '/wishlist', bookings: '/bookings',
      'booking-confirmed': '/booking-confirmed',
      blog: '/blog', contact: '/contact', privacy: '/privacy', terms: '/terms', cookies: '/cookies',
      about: '/about', sitemap: '/sitemap',
      'legal-notice': '/legal-notice', affiliate: '/affiliate', 'content-creator': '/content-creator',
    };
    const path =
      currentPage === 'destination'
        ? `/destinations/${destinationSlug || ''}`
        : currentPage === 'inventory-reserved'
          ? '/experiences'
          : currentPage === 'not-found'
            ? window.location.pathname
          : (pathMap[currentPage] ?? '/');
    setCanonicalUrl(path);
  }, [currentPage, destinationSlug, isSupplierArea]);

  const handleNavigate = useCallback((page: string) => {
    if (isStaticConsumerPage(page) && !isStaticConsumerPage(currentPage)) {
      rememberProductReturn(currentPage, `${window.location.pathname}${window.location.search}`);
    }
    if (page === 'stays') {
      const stayId = takeTravelerReturnStay();
      if (stayId) {
        void getListingByIdAsync(stayId).then((t) => {
          if (!t || !listingIsFamily(t, 'stay')) {
            setCurrentPage('stays');
            return;
          }
          setSelectedTour(t);
          setCurrentPage('stay-details');
        });
        return;
      }
    }
    setCurrentPage(page);
  }, [currentPage]);

  const handleTourSelect = (tour: TourPackageType) => {
    if (listingIsFamily(tour, 'stay')) {
      setSelectedTour(tour);
      setCurrentPage('stay-details');
      return;
    }
    if (!listingIsOnTravelerCatalog(tour)) return;
    setSelectedTour(tour);
    setCurrentPage('tour-details');
  };

  const handleBackToStays = () => {
    setSelectedTour(null);
    setCurrentPage('stays');
    const params = new URLSearchParams(window.location.search);
    params.delete('stay');
    params.delete('tour');
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `/stays?${qs}` : '/stays');
  };

  const handleBackToTours = () => {
    setSelectedTour(null);
    setCurrentPage('packages');
    const params = new URLSearchParams(window.location.search);
    params.delete('tour');
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `/packages?${qs}` : '/packages');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onTourSelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'packages':
        return <Packages onTourSelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'stays':
        return <Stays onStaySelect={handleTourSelect} onNavigate={handleNavigate} />;
      case 'stay-details':
        return selectedTour ? (
          <StayDetails stayId={selectedTour.id} onBack={handleBackToStays} />
        ) : (
          <div className="min-h-[50vh] bg-paper" aria-busy="true" aria-label="Loading stay">
            <RouteFallback />
          </div>
        );
      case 'inventory-reserved':
        return (
          <ReservedInventoryPage
            family="experience"
            onNavigate={handleNavigate}
          />
        );
      case 'destination':
        return (
          <DestinationPage
            slug={destinationSlug}
            onTourSelect={handleTourSelect}
            onBack={handleBackToTours}
            onNavigate={handleNavigate}
          />
        );
      case 'blog':
        return <Blog onNavigate={handleNavigate} />;
      case 'tour-details':
        return selectedTour ? (
          <TourDetails tourId={selectedTour.id} onBack={handleBackToTours} />
        ) : (
          <div className="min-h-[50vh] bg-paper" aria-busy="true" aria-label="Loading tour">
            <RouteFallback />
          </div>
        );
      case 'booking':
        return selectedTour ? (
          <TourDetails tourId={selectedTour.id} onBack={handleBackToTours} />
        ) : (
          <div className="min-h-[50vh] bg-paper" aria-busy="true" aria-label="Loading tour">
            <RouteFallback />
          </div>
        );
      case 'cart':
        return (
          <CartPage
            onNavigate={handleNavigate}
            onBookTour={(listingId) => {
              void getListingByIdAsync(listingId).then((t) => {
                if (!t) {
                  window.history.pushState({}, '', '/packages');
                  setCurrentPage('packages');
                  return;
                }
                handleTourSelect(t);
              });
            }}
          />
        );
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
        return <EmailConfirmedSuccess />;
      case 'bookings':
        return (
          <MyBookings
            onNavigate={handleNavigate}
            onTourSelect={(t) => handleTourSelect(t as TourPackageType)}
          />
        );
      case 'booking-confirmed':
        return <BookingConfirmationPage onNavigate={handleNavigate} />;
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
            <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-slate-900 text-gray-300">
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
            <div className="max-w-lg mx-auto px-4 py-16">
              <ErrorState
                title="Page not found"
                body="This address is not a Traverion page. Check the link, or open Tours."
                back={{ onClick: () => handleNavigate('packages'), label: 'Browse tours' }}
              />
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
            <Suspense fallback={<PartnerRouteFallback />}>
              <SupplierLayout />
            </Suspense>
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

  const minimalTravelerChrome = currentPage === 'booking-confirmed' || currentPage === 'reset-password';

  return (
    <TranslationProvider>
      <AuthProvider>
        {staffShell ? (
          <>
            <Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>
            <AuthModal />
          </>
        ) : minimalTravelerChrome ? (
          <div className="min-h-screen bg-paper">
            <Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>
            <AuthModal />
          </div>
        ) : (
          <div className="min-h-screen bg-paper relative flex flex-col">
            <SkipLink />
            <UnifiedHeader currentPage={currentPage} onNavigate={handleNavigate} />
            <main id="main-content" tabIndex={-1} className="flex-grow overflow-x-hidden outline-none">
              <div className="lux-page-enter min-h-[min(50vh,480px)]">
                <Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>
              </div>
            </main>
            <Footer onNavigate={handleNavigate} />
            <AuthModal />
          </div>
        )}
      </AuthProvider>
    </TranslationProvider>
  );
}

export default App;
