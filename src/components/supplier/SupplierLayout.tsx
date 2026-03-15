import { useState, useEffect } from 'react';
import { LayoutDashboard, MapPin, Calendar, DollarSign, Settings, LogOut, Globe, Menu, X, Sparkles, Users, BarChart3 } from 'lucide-react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import SupplierAuth from '../../pages/supplier/SupplierAuth';
import SupplierDashboard from '../../pages/supplier/SupplierDashboard';
import SupplierListings from '../../pages/supplier/SupplierListings';
import SupplierBookings from '../../pages/supplier/SupplierBookings';
import SupplierEarnings from '../../pages/supplier/SupplierEarnings';

type SupplierSection = 'dashboard' | 'listings' | 'bookings' | 'earnings' | 'settings';

const NAV_ITEMS: { id: SupplierSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'listings', label: 'My listings', icon: MapPin },
  { id: 'bookings', label: 'Bookings', icon: Calendar },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function getSectionFromPath(pathname: string): SupplierSection | null {
  if (pathname === '/supplier' || pathname === '/supplier/') return 'dashboard';
  const match = pathname.match(/^\/supplier\/([a-z]+)/);
  if (!match) return null;
  const section = match[1] as SupplierSection;
  return NAV_ITEMS.some((n) => n.id === section) ? section : 'dashboard';
}

function pushSupplierPath(section: SupplierSection) {
  const path = section === 'dashboard' ? '/supplier' : `/supplier/${section}`;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function SupplierLayout() {
  const { user, loading, signOut, isSupabase } = useSupplierAuth();
  const [section, setSection] = useState<SupplierSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const syncFromPath = () => {
      const s = getSectionFromPath(window.location.pathname);
      if (s) setSection(s);
    };
    syncFromPath();
    window.addEventListener('popstate', syncFromPath);
    return () => window.removeEventListener('popstate', syncFromPath);
  }, []);

  const handleNavigate = (s: SupplierSection) => {
    setSection(s);
    pushSupplierPath(s);
    setSidebarOpen(false);
  };

  const handleAuthenticated = () => {
    setSection('dashboard');
    pushSupplierPath('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-gray-900 font-semibold">
              <Globe className="w-6 h-6 text-finland" />
              TRAVERION
            </a>
            <a href="/" className="text-sm text-gray-600 hover:text-finland">Back to main site</a>
          </div>
        </header>
        <main>
          {/* For suppliers landing */}
          <section className="bg-gradient-to-b from-finland/5 to-transparent border-b border-gray-200">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-finland/10 text-finland text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                For tour & activity providers
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
                List your tours on Traverion
              </h1>
              <p className="text-lg text-gray-600 mb-10">
                Reach travelers worldwide. Manage listings, bookings, and earnings in one place.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
                <div className="flex gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-finland/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-finland" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">List once</p>
                    <p className="text-sm text-gray-600">Your tours appear on the main site for all travelers.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Get bookings</p>
                    <p className="text-sm text-gray-600">Confirm or cancel, see guest details and special requests.</p>
                  </div>
                </div>
                <div className="flex gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Track earnings</p>
                    <p className="text-sm text-gray-600">Pending and paid payouts in your dashboard.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="max-w-md mx-auto px-4 sm:px-6 py-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">Log in or sign up</h2>
            <SupplierAuth onAuthenticated={handleAuthenticated} isSupabase={isSupabase} />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-30">
        <div className="p-4 border-b border-gray-200">
          <a href="/" className="flex items-center gap-2 text-gray-900 font-semibold">
            <Globe className="w-6 h-6 text-finland" />
            TRAVERION
          </a>
          <p className="text-xs text-gray-500 mt-0.5">Supplier portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                section === item.id ? 'bg-finland/10 text-finland' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`lg:hidden fixed top-0 left-0 w-64 h-full bg-white border-r border-gray-200 z-50 transform transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-gray-900 font-semibold">
            <Globe className="w-6 h-6 text-finland" />
            TRAVERION
          </a>
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium ${
                section === item.id ? 'bg-finland/10 text-finland' : 'text-gray-600'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-gray-600"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:pl-64">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20 h-16 flex items-center px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-600"
          >
            <Menu className="w-6 h-6" />
          </button>
          <a href="/" className="ml-auto text-sm text-gray-600 hover:text-finland">Back to main site</a>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          {section === 'dashboard' && (
            <SupplierDashboard onNavigateToListings={() => handleNavigate('listings')} />
          )}
          {section === 'listings' && <SupplierListings />}
          {section === 'bookings' && <SupplierBookings />}
          {section === 'earnings' && <SupplierEarnings />}
          {section === 'settings' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Account</h2>
                  <p className="mt-1 text-gray-900">{user?.email ?? '—'}</p>
                  <p className="mt-1 text-sm text-gray-500">You are logged in as a supplier. Payout method and notifications can be added here later.</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
