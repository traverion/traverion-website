import { useState, useEffect } from 'react';
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
import TourPackage from './pages/TourPackage';
import Vietnam9Day from './pages/Vietnam9Day';
import Vietnam12Day from './pages/Vietnam12Day';
import Thailand10Day from './pages/Thailand10Day';
import Cambodia10Day from './pages/Cambodia10Day';
import Indochina14Day from './pages/Indochina14Day';
import ThailandVietnam14Day from './pages/ThailandVietnam14Day';
import Contact from './pages/Contact';
import DestinationPage from './pages/DestinationPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminAccess from './components/AdminAccess';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Cookies from './pages/Cookies';
import { TranslationProvider } from './contexts/TranslationContext';
import { SupplierAuthProvider } from './contexts/SupplierAuthContext';
import { AuthProvider } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import { setPageMeta } from './lib/seo';
import { TourPackage as TourPackageType } from './types/tour';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [destinationSlug, setDestinationSlug] = useState<string | null>(null);
  const [selectedTour, setSelectedTour] = useState<TourPackageType | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // Supplier area at /supplier and /supplier/* — separate layout, no main header/footer
  const isSupplierArea =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/supplier');
  if (isSupplierArea) {
    return (
      <TranslationProvider>
        <SupplierAuthProvider>
          <SupplierLayout />
        </SupplierAuthProvider>
      </TranslationProvider>
    );
  }

  // Handle clean URLs and detect current page from URL
  useEffect(() => {
    const path = window.location.pathname;

    // Map clean URLs to internal routes
    const urlMapping: { [key: string]: string } = {
      '/14-vietnam-thailand': 'thailand-vietnam-14-day',
      '/9-vietnam': 'vietnam-9-day',
      '/12-vietnam': 'vietnam-12-day',
      '/10-thailand': 'thailand-10-day',
      '/10-cambodia': 'cambodia-10-day',
      '/14-indochina': 'indochina-14-day',
      '/packages': 'packages',
      '/bookings': 'bookings',
      '/blog': 'blog',
      '/contact': 'contact',
      '/admin': 'admin',
      '/privacy': 'privacy',
      '/terms': 'terms',
      '/cookies': 'cookies'
    };

    const mappedPage = urlMapping[path];
    if (mappedPage) {
      setCurrentPage(mappedPage);
      setDestinationSlug(null);
    } else if (path.startsWith('/destinations/')) {
      const slug = path.replace(/^\/destinations\/?/, '') || null;
      setCurrentPage('destination');
      setDestinationSlug(slug);
    } else if (path === '/' || path === '') {
      setCurrentPage('home');
      setDestinationSlug(null);
    }
  }, []);

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
      'bookings': '/bookings',
      'blog': '/blog',
      'contact': '/contact',
      'admin': '/admin',
      'privacy': '/privacy',
      'terms': '/terms',
      'cookies': '/cookies',
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

  // Document title and meta per page
  useEffect(() => {
    const titles: Record<string, { title: string; description?: string }> = {
      home: { title: 'Traverion', description: 'Book tours and activities worldwide. Find and reserve experiences with free cancellation.' },
      packages: { title: 'Tours & activities', description: 'Browse and book tours and activities worldwide. Filter by destination, price, and more.' },
      bookings: { title: 'My bookings', description: 'View your tour and activity reservations and their status.' },
      blog: { title: 'Blog', description: 'Travel stories and tips from Traverion.' },
      contact: { title: 'Contact', description: 'Get in touch with Traverion.' },
      privacy: { title: 'Privacy Policy', description: 'Traverion privacy policy.' },
      terms: { title: 'Terms of Service', description: 'Traverion terms of service.' },
      cookies: { title: 'Cookie Policy', description: 'Traverion cookie policy.' },
      destination: { title: 'Destination', description: 'Tours and activities in this destination.' },
    };
    const meta = titles[currentPage];
    if (meta) setPageMeta(meta.title, meta.description);
    else setPageMeta('');
  }, [currentPage]);

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
          />
        ) : <Home onTourSelect={handleTourSelect} />;
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
        return <Contact />;
      case 'privacy':
        return <Privacy />;
      case 'terms':
        return <Terms />;
      case 'cookies':
        return <Cookies />;
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
              <main className="flex-grow">{renderPage()}</main>
              <Footer />
              <StickyBookingButton onNavigate={setCurrentPage} />
            </div>
            <AuthModal />
          </AuthProvider>
        </TranslationProvider>
      );
}

export default App;
