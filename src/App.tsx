import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import UnifiedHeader from './components/UnifiedHeader';
import StickyBookingButton from './components/StickyBookingButton';
import Footer from './components/Footer';
import SupplierLayout from './components/supplier/SupplierLayout';
import Home from './pages/Home';
import SimpleHome from './pages/SimpleHome';
import Packages from './pages/Packages';
import Blog from './pages/Blog';
import TourDetails from './pages/TourDetails';
import MyBookings from './pages/MyBookings';
import BookingConfirmationPage from './pages/BookingConfirmationPage';
import CartPage from './pages/CartPage';
import AccountPage from './pages/AccountPage';
import WishlistPage from './pages/WishlistPage';
import TourPackage from './pages/TourPackage';
import Vietnam9Day from './pages/Vietnam9Day';
import Vietnam12Day from './pages/Vietnam12Day';
import Thailand10Day from './pages/Thailand10Day';
import Cambodia10Day from './pages/Cambodia10Day';
import Indochina14Day from './pages/Indochina14Day';
import ThailandVietnam14Day from './pages/ThailandVietnam14Day';
import Contact from './pages/Contact';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import EmailConfirmedSuccess from './pages/EmailConfirmedSuccess';
import DestinationPage from './pages/DestinationPage';
import AdminGate from './components/AdminGate';
import AdminStaffLogin from './components/admin/AdminStaffLogin';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Cookies from './pages/Cookies';
import About from './pages/About';
import Sitemap from './pages/Sitemap';
import LegalNotice from './pages/LegalNotice';
import AffiliatePage from './pages/AffiliatePage';
import ContentCreatorPage from './pages/ContentCreatorPage';
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
import { isPartnerMarketingPathForCurrentHost, isPartnerPortalPathForCurrentHost } from './lib/partnerHost';
import { TourPackage as TourPackageType } from './types/tour';

function readInitialRoute(): { page: string; destinationSlug: string | null } {
  if (typeof window === 'undefined') return { page: 'home', destinationSlug: null };
  if (isTraverionAdminHost()) {
    return parsePathname(window.location.pathname, { adminHost: true });
  }
  const path = normalizePublicTourDeepLinkPathname(window.location.pathname);
  let { page, destinationSlug } = parsePathname(path);
  page = mapStripeReturnRoute(page, window.location.search);
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
      : normalizePublicTourDeepLinkPathname(window.location.pathname);
    let { page, destinationSlug } = parsePathname(pathForParse, { adminHost });
    page = mapStripeReturnRoute(page, window.location.search);
    setCurrentPage(page);
    setDestinationSlug(destinationSlug);
    const keepTourForDeepLink =
      !adminHost && page === 'packages' && tourParam && /^[0-9a-f-]{36}$/i.test(tourParam);
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
    if (currentPage === 'tour-details' && selectedTour) {
      const qs = new URLSearchParams({ tour: selectedTour.id }).toString();
      const next = `/packages?${qs}`;
      if (window.location.pathname !== '/packages' || window.location.search !== `?${qs}`) {
        window.history.replaceState({}, '', next);
      }
      return;
    }
    if (currentPage === 'auth' || currentPage === 'email-confirmed') {
      return;
    }
    const urlMapping: { [key: string]: string } = {
      'thailand-vietnam-14-day': '/14-vietnam-thailand',
      'vietnam-9-day': '/9-vietnam',
      'vietnam-12-day': '/12-vietnam',
      'thailand-10-day': '/10-thailand',
      'cambodia-10-day': '/10-cambodia',
      'indochina-14-day': '/14-indochina',
      'packages': '/packages',
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
      packages: { title: 'Tours & activities', description: 'Browse and book tours and activities worldwide. Filter by destination, price, and more.' },
      auth: { title: 'Sign in', description: 'Sign in or create an account to manage your bookings and cart.' },
      'reset-password': { title: 'Set a new password', description: 'Choose a new password for your Traverion traveler account.' },
      'email-confirmed': { title: 'Email confirmed', description: 'Your Traverion traveler email was verified.' },
      cart: { title: 'Cart', description: 'Your cart. Request bookings for selected tours.' },
      account: { title: 'My account', description: 'Your bookings, wishlist, and cart in one place.' },
      wishlist: { title: 'Wishlist', description: 'Tours and activities you have saved.' },
      bookings: { title: 'My bookings', description: 'View your tour and activity reservations and their status.' },
      'booking-confirmed': { title: 'Booking confirmed', description: 'Your tour payment was successful.' },
      blog: { title: 'Blog', description: 'Travel stories and tips from Traverion.' },
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
    };
    const meta = metaByPage[currentPage];
    if (meta) setPageMetaWithOg(meta.title, meta.description);
    else setPageMetaWithOg('Traverion', 'Tours & activities worldwide.');

    setRobotsNoIndex(currentPage === 'booking-confirmed' || currentPage === 'reset-password');

    const pathMap: Record<string, string> = {
      home: '/', packages: '/packages', auth: '/auth', 'reset-password': '/account/reset-password', 'email-confirmed': '/email-confirmed', cart: '/cart', account: '/account', wishlist: '/wishlist', bookings: '/bookings',
      'booking-confirmed': '/booking-confirmed',
      blog: '/blog', contact: '/contact', privacy: '/privacy', terms: '/terms', cookies: '/cookies',
      about: '/about', sitemap: '/sitemap',
      'legal-notice': '/legal-notice', affiliate: '/affiliate', 'content-creator': '/content-creator',
    };
    const path = currentPage === 'destination' ? `/destinations/${destinationSlug || ''}` : (pathMap[currentPage] ?? '/');
    setCanonicalUrl(path);
  }, [currentPage, destinationSlug, isSupplierArea]);

  const handleTourSelect = (tour: TourPackageType) => {
    setSelectedTour(tour);
    setCurrentPage('tour-details');
  };

  const handleBackToTours = () => {
    setSelectedTour(null);
    setCurrentPage('packages');
    window.history.replaceState({}, '', '/packages');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onTourSelect={handleTourSelect} onNavigate={setCurrentPage} />;
      case 'packages':
        return <Packages onTourSelect={handleTourSelect} onNavigate={setCurrentPage} />;
      case 'destination':
        return (
          <DestinationPage
            slug={destinationSlug}
            onTourSelect={handleTourSelect}
            onBack={() => setCurrentPage('packages')}
            onNavigate={setCurrentPage}
          />
        );
      case 'blog':
        return <Blog />;
      case 'tour-details':
        return selectedTour ? (
          <TourDetails tourId={selectedTour.id} onBack={handleBackToTours} />
        ) : (
          <Home onTourSelect={handleTourSelect} />
        );
      case 'booking':
        return selectedTour ? (
          <TourDetails tourId={selectedTour.id} onBack={handleBackToTours} />
        ) : (
          <Home onTourSelect={handleTourSelect} />
        );
      case 'cart':
        return <CartPage onNavigate={setCurrentPage} />;
      case 'account':
        return <AccountPage onNavigate={setCurrentPage} />;
      case 'wishlist':
        return (
          <WishlistPage
            onNavigate={setCurrentPage}
            onTourSelect={(t) => handleTourSelect(t as TourPackageType)}
          />
        );
      case 'auth':
        return <AuthPage onNavigate={setCurrentPage} />;
      case 'reset-password':
        return <ResetPasswordPage onNavigate={setCurrentPage} />;
      case 'email-confirmed':
        return <EmailConfirmedSuccess />;
      case 'bookings':
        return (
          <MyBookings
            onNavigate={setCurrentPage}
            onTourSelect={(t) => handleTourSelect(t as TourPackageType)}
          />
        );
      case 'booking-confirmed':
        return <BookingConfirmationPage onNavigate={setCurrentPage} />;
      case 'tour-package':
        return selectedTour ? (
          <TourPackage 
            tourId={selectedTour.id} 
            onBack={handleBackToTours}
          />
        ) : <Home onTourSelect={handleTourSelect} />;
      case 'vietnam-9-day':
        return <Vietnam9Day onBack={() => setCurrentPage('packages')} />;
      case 'vietnam-12-day':
        return <Vietnam12Day onBack={() => setCurrentPage('packages')} />;
      case 'thailand-10-day':
        return <Thailand10Day onBack={() => setCurrentPage('packages')} />;
      case 'cambodia-10-day':
        return <Cambodia10Day onBack={() => setCurrentPage('packages')} />;
      case 'indochina-14-day':
        return <Indochina14Day onBack={() => setCurrentPage('packages')} />;
      case 'thailand-vietnam-14-day':
        return <ThailandVietnam14Day onBack={() => setCurrentPage('packages')} />;
      case 'contact':
        return <Contact onNavigate={setCurrentPage} />;
      case 'legal-notice':
        return <LegalNotice onNavigate={setCurrentPage} />;
      case 'affiliate':
        return <AffiliatePage onNavigate={setCurrentPage} />;
      case 'content-creator':
        return <ContentCreatorPage onNavigate={setCurrentPage} />;
      case 'privacy':
        return <Privacy onNavigate={setCurrentPage} />;
      case 'terms':
        return <Terms onNavigate={setCurrentPage} />;
      case 'cookies':
        return <Cookies onNavigate={setCurrentPage} />;
      case 'about':
        return <About onNavigate={setCurrentPage} />;
      case 'sitemap':
        return <Sitemap onNavigate={setCurrentPage} />;
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
      default:
        return <SimpleHome onTourSelect={handleTourSelect} onNavigate={setCurrentPage} />;
    }
  };

  if (isSupplierArea) {
    return (
      <TranslationProvider>
        <AuthProvider>
          <SupplierAuthProvider>
            <SupplierLayout />
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
            {renderPage()}
            <AuthModal />
          </>
        ) : minimalTravelerChrome ? (
          <div className="min-h-screen bg-white">
            {renderPage()}
            <AuthModal />
          </div>
        ) : (
          <div className="min-h-screen bg-white relative flex flex-col">
            <UnifiedHeader currentPage={currentPage} onNavigate={setCurrentPage} />
            <main className="flex-grow overflow-x-hidden">
              <div key={currentPage} className="lux-page-enter min-h-[min(50vh,480px)]">
                {renderPage()}
              </div>
            </main>
            <Footer onNavigate={setCurrentPage} />
            <StickyBookingButton onNavigate={setCurrentPage} />
            <AuthModal />
          </div>
        )}
      </AuthProvider>
    </TranslationProvider>
  );
}

export default App;
