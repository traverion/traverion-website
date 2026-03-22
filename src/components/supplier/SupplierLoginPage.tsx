/**
 * Supplier login/landing at /supplier-log-in. Shown when not logged in.
 * After successful login, onAuthenticated is called (redirect to /supplier).
 */
import { Globe, MapPin, Users, BarChart3, Sparkles } from 'lucide-react';
import SupplierAuth from '../../pages/supplier/SupplierAuth';

interface SupplierLoginPageProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

export default function SupplierLoginPage({ onAuthenticated, isSupabase }: SupplierLoginPageProps) {
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
      <main className="overflow-x-hidden">
        <div className="lux-page-enter">
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
          <SupplierAuth onAuthenticated={onAuthenticated} isSupabase={isSupabase} />
        </section>
        </div>
      </main>
    </div>
  );
}
