/**
 * Supplier login/landing at /supplier-log-in. Shown when not logged in.
 * After successful login, onAuthenticated is called (redirect to /supplier).
 */
import { MapPin, Users, BarChart3, Sparkles } from 'lucide-react';
import SupplierAuth from '../../pages/supplier/SupplierAuth';
import Footer from '../Footer';

interface SupplierLoginPageProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

export default function SupplierLoginPage({ onAuthenticated, isSupabase }: SupplierLoginPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 sm:gap-3 text-gray-900 min-w-0">
            <img
              src="/traveriontransparent.png"
              alt=""
              className="h-9 w-9 sm:h-10 sm:w-10 object-contain flex-shrink-0"
            />
            <div className="min-w-0">
              <span className="font-semibold text-lg sm:text-xl text-finland tracking-tight block leading-tight">
                TRAVERION
              </span>
              <span className="hidden sm:block text-xs text-gray-600 font-light">
                Tours &amp; Activities · Worldwide
              </span>
            </div>
          </a>
          <a
            href="/"
            className="text-sm text-gray-600 hover:text-finland transition-colors duration-300 ease-lux whitespace-nowrap"
          >
            Back to main site
          </a>
        </div>
      </header>
      <main className="overflow-x-hidden flex-1 w-full">
        <div className="lux-page-enter">
        <section className="bg-gradient-to-b from-finland/5 to-transparent border-b border-gray-200">
          <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 text-left">
              <div className="flex gap-3 p-4 sm:p-5 rounded-xl bg-white border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-finland/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-finland" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">List once</p>
                  <p className="text-sm text-gray-600">Your tours appear on the main site for all travelers.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 sm:p-5 rounded-xl bg-white border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Get bookings</p>
                  <p className="text-sm text-gray-600">Confirm or cancel, see guest details and special requests.</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 sm:p-5 rounded-xl bg-white border border-gray-100 shadow-sm">
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
        <section className="w-full max-w-2xl xl:max-w-5xl 2xl:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6 lg:mb-8 text-center">
            Log in or sign up
          </h2>
          <SupplierAuth onAuthenticated={onAuthenticated} isSupabase={isSupabase} />
        </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
