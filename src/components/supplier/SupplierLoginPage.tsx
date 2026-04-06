/**
 * Partner login at /login (partner.traverion.com). After auth, redirect to /partner dashboard.
 */
import { MapPin, Users, BarChart3, Sparkles } from 'lucide-react';
import SupplierAuth from '../../pages/supplier/SupplierAuth';
import PartnerPortalFooter from './PartnerPortalFooter';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { HERO_IMG } from '../../lib/heroImages';

const FEATURE_CARDS = [
  {
    icon: MapPin,
    title: 'List once',
    body: 'Your tours appear on the main site for all travelers.',
    iconWrap: 'bg-finland/15 text-finland ring-1 ring-finland/20',
  },
  {
    icon: Users,
    title: 'Get bookings',
    body: 'Confirm or cancel, see guest details and special requests.',
    iconWrap: 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25',
  },
  {
    icon: BarChart3,
    title: 'Track earnings',
    body: 'Pending and paid payouts in your dashboard.',
    iconWrap: 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/25',
  },
] as const;

interface SupplierLoginPageProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

export default function SupplierLoginPage({ onAuthenticated, isSupabase }: SupplierLoginPageProps) {
  const mainSiteUrl = publicSiteBaseUrl();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 sm:gap-3 text-gray-900 min-w-0">
            <img
              src={BRAND_LOGO_SRC}
              alt=""
              className="h-11 w-11 sm:h-12 sm:w-12 object-contain flex-shrink-0"
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
            href={mainSiteUrl}
            className="text-sm text-gray-600 hover:text-finland transition-colors duration-300 ease-lux whitespace-nowrap"
          >
            Back to main site
          </a>
        </div>
      </header>
      <main className="overflow-x-hidden flex-1 w-full">
        <div className="lux-page-enter">
        <section className="relative overflow-hidden border-b border-white/30">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 motion-reduce:scale-100"
              style={{
                backgroundImage: `url(${HERO_IMG.vacation})`,
                filter: 'blur(14px)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/72 to-white/88" />
            <div className="absolute inset-0 bg-gradient-to-br from-finland/[0.06] via-transparent to-finland/[0.04]" />
          </div>
          <div className="relative max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md text-finland text-sm font-medium mb-6 shadow-soft border border-white/60 animate-fade-in-down motion-reduce:animate-none motion-reduce:opacity-100 opacity-0 [animation-fill-mode:forwards]">
              <Sparkles className="w-4 h-4 motion-safe:animate-pulse" />
              For tour & activity providers
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.35rem] font-bold text-gray-900 mb-3 tracking-tight animate-slide-up motion-reduce:animate-none motion-reduce:opacity-100 opacity-0 [animation-delay:80ms] [animation-fill-mode:forwards]">
              List your tours on Traverion
            </h1>
            <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up motion-reduce:animate-none motion-reduce:opacity-100 opacity-0 [animation-delay:160ms] [animation-fill-mode:forwards]">
              Reach travelers worldwide. Manage listings, bookings, and earnings in one place.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 text-left">
              {FEATURE_CARDS.map(({ icon: Icon, title, body, iconWrap }, i) => (
                <div
                  key={title}
                  className="group flex gap-4 p-5 sm:p-6 rounded-2xl bg-white/85 backdrop-blur-md border border-white/70 shadow-soft-lg ring-1 ring-finland/5 transition-all duration-300 ease-lux motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-soft-xl motion-safe:hover:border-finland/15 animate-slide-up motion-reduce:animate-none motion-reduce:opacity-100 opacity-0 [animation-fill-mode:forwards]"
                  style={{ animationDelay: `${240 + i * 110}ms` }}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-transform duration-300 ease-lux motion-safe:group-hover:scale-105 ${iconWrap}`}
                  >
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="font-semibold text-gray-900 text-base">{title}</p>
                    <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
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
      <PartnerPortalFooter />
    </div>
  );
}
