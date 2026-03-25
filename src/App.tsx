import { useState, useEffect, useCallback } from 'react';
import UnifiedHeader from './components/UnifiedHeader';
import StickyBookingButton from './components/StickyBookingButton';
import Footer from './components/Footer';
import SupplierLayout from './components/supplier/SupplierLayout';
import Home from './pages/Home';
import SimpleHome from './pages/SimpleHome';
import Packages from './pages/Packages';
import Blog from './pages/Blog';
import TourDetails from './pages/TourDetails';
import BookingPage from './pages/BookingPage';
import MyBookings from './pages/MyBookings';
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
import DestinationPage from './pages/DestinationPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminAccess from './components/AdminAccess';
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
import { setPageMetaWithOg, setCanonicalUrl, setOrganizationJsonLd } from './lib/seo';
import { parsePathname, shouldClearSelectedTour } from './lib/appRouting';
import { TourPackage as TourPackageType } from './types/tour';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [destinationSlug, setDestinationSlug] = useState<string | null>(null);
  const [selectedTour, setSelectedTour] = useState<TourPackageType | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // Supplier portal: /supplier/* and dedicated login URL (must mount SupplierLayout for both)
  const supplierPath =
    typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') || '/' : '';
  const isSupplierArea =
    supplierPath.startsWith('/supplier') || supplierPath === '/supplier-log-in';
  if (isSupplierArea) {
    return (
      <TranslationProvider>
        <SupplierAuthProvider>
          <SupplierLayout />
        </SupplierAuthProvider>
      </TranslationProvider>
    );
  }

  // Sync internal route from the URL (initial load + browser back/forward)
  const syncRouteFromUrl = useCallback(() => {
    const { page, destinationSlug } = parsePathname(window.location.pathname);
    setCurrentPage(page);
    setDestinationSlug(destinationSlug);
    if (shouldClearSelectedTour(page)) {
      setSelectedTour(null);
    }
  }, []);

  useEffect(() => {
    syncRouteFromUrl();
  }, [syncRouteFromUrl]);

  useEffect(() => {
    const onPopState = () => syncRouteFromUrl();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [syncRouteFromUrl]);

  // Update URL when page changes
  useEffect(() => {
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
      window.history.pushState({}, '', newUrl);
    }
  }, [currentPage, destinationSlug]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Organization JSON-LD once on mount
  useEffect(() => {
    setOrganizationJsonLd();
  }, []);

  // Document title, meta, OG/Twitter, and canonical URL per page
  useEffect(() => {
    const metaByPage: Record<string, { title: string; description?: string }> = {
      home: { title: 'Traverion', description: 'Book tours and activities worldwide. Find and reserve experiences with free cancellation.' },
      packages: { title: 'Tours & activities', description: 'Browse and book tours and activities worldwide. Filter by destination, price, and more.' },
      auth: { title: 'Sign in', description: 'Sign in or create an account to manage your bookings and cart.' },
      cart: { title: 'Cart', description: 'Your cart. Request bookings for selected tours.' },
      account: { title: 'My account', description: 'Your bookings, wishlist, and cart in one place.' },
      wishlist: { title: 'Wishlist', description: 'Tours and activities you have saved.' },
      bookings: { title: 'My bookings', description: 'View your tour and activity reservations and their status.' },
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
      admin: { title: 'Admin', description: 'Traverion admin.' },
    };
    const meta = metaByPage[currentPage];
    if (meta) setPageMetaWithOg(meta.title, meta.description);
    else setPageMetaWithOg('Traverion', 'Tours & activities worldwide.');

    const pathMap: Record<string, string> = {
      home: '/', packages: '/packages', auth: '/auth', cart: '/cart', account: '/account', wishlist: '/wishlist', bookings: '/bookings',
      blog: '/blog', contact: '/contact', privacy: '/privacy', terms: '/terms', cookies: '/cookies',
      about: '/about', sitemap: '/sitemap', admin: '/admin',
      'legal-notice': '/legal-notice', affiliate: '/affiliate', 'content-creator': '/content-creator',
    };
    const path = currentPage === 'destination' ? `/destinations/${destinationSlug || ''}` : (pathMap[currentPage] ?? '/');
    setCanonicalUrl(path);
  }, [currentPage, destinationSlug]);

  const handleTourSelect = (tour: TourPackageType) => {
    setSelectedTour(tour);
    setCurrentPage('tour-details');
  };

  const handleBackToTours = () => {
    setSelectedTour(null);
    setCurrentPage('packages');
  };

  const handleBookTour = (tour: TourPackageType) => {
    setSelectedTour(tour);
    setCurrentPage('booking');
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
          <TourDetails 
            tourId={selectedTour.id} 
            onBack={handleBackToTours}
            onBook={handleBookTour}
          />
        ) : <Home onTourSelect={handleTourSelect} />;
      case 'booking':
        return selectedTour ? (
          <BookingPage
            tour={selectedTour}
            onBack={() => setCurrentPage('tour-details')}
            onComplete={() => { setSelectedTour(null); setCurrentPage('packages'); }}
            onNavigate={setCurrentPage}
          />
        ) : <Home onTourSelect={handleTourSelect} />;
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
      case 'bookings':
        return (
          <MyBookings
            onNavigate={setCurrentPage}
            onTourSelect={(t) => handleTourSelect(t as TourPackageType)}
          />
        );
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
        return isAdminAuthenticated ? <AdminDashboard /> : <AdminAccess onAccessGranted={() => setIsAdminAuthenticated(true)} />;
      default:
        return <SimpleHome onTourSelect={handleTourSelect} onNavigate={setCurrentPage} />;
    }
  };

      return (
        <TranslationProvider>
          <AuthProvider>
            <div className="min-h-screen bg-white relative flex flex-col">
              <UnifiedHeader currentPage={currentPage} onNavigate={setCurrentPage} />
              <main className="flex-grow overflow-x-hidden">
                <div key={currentPage} className="lux-page-enter min-h-[min(50vh,480px)]">
                  {renderPage()}
                </div>
              </main>
              <Footer onNavigate={setCurrentPage} />
              <StickyBookingButton onNavigate={setCurrentPage} />
            </div>
            <AuthModal />
          </AuthProvider>
        </TranslationProvider>
      );
}

export default App;
