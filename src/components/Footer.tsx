import { MapPin, Phone, Mail, Facebook, Instagram, Twitter, Youtube, Star, Shield } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';

/** GetYourGuide-style footer: compact columns, trust line, legal bar */
export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="flex items-center gap-2 mb-3">
              <img src="/traveriontransparent.png" alt="" className="h-9 w-auto" />
              <span className="font-semibold text-lg text-white">TRAVERION</span>
            </a>
            <p className="text-sm text-gray-400 mb-4 max-w-xs">
              {t.footer?.description ?? 'Book tours and activities worldwide. Best price guarantee.'}
            </p>
            <div className="flex gap-2">
              <a href="https://facebook.com/traverion" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-white/10 text-gray-400 hover:text-white hover:bg-white/20 transition-colors" aria-label="Facebook">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="https://instagram.com/traverion" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-white/10 text-gray-400 hover:text-white hover:bg-white/20 transition-colors" aria-label="Instagram">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="https://twitter.com/traverion" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-white/10 text-gray-400 hover:text-white hover:bg-white/20 transition-colors" aria-label="Twitter">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Discover */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">Discover</h3>
            <ul className="space-y-2">
              <li><a href="/packages" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer?.links?.travelPackages ?? 'Tours & activities'}</a></li>
              <li><a href="/packages" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer?.links?.destinations ?? 'Destinations'}</a></li>
              <li><a href="/blog" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer?.links?.blogStories ?? 'Blog'}</a></li>
              <li><a href="/supplier" className="text-gray-400 hover:text-white text-sm transition-colors">For suppliers</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">Support</h3>
            <ul className="space-y-2">
              <li><a href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer?.links?.customerReviews ?? 'Contact'}</a></li>
              <li><a href="/contact" className="text-gray-400 hover:text-white text-sm transition-colors">{t.footer?.getInTouch ?? 'Get in touch'}</a></li>
            </ul>
            <div className="mt-3 space-y-1 text-sm text-gray-400">
              <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {t.footer?.contact?.email ?? 'info@traverion.com'}</p>
              <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {t.footer?.contact?.phone ?? '+358 45 783 451 38'}</p>
            </div>
          </div>
        </div>

        {/* Trust line */}
        <div className="mt-10 pt-8 border-t border-white/10 flex flex-wrap justify-center gap-6 text-sm text-gray-400">
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs">✓</span>
            Free cancellation
          </span>
          <span className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-finland" />
            Best price guarantee
          </span>
          <span className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            Verified reviews
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-gray-500">
            <p>© {currentYear} Traverion. {t.footer?.rights ?? 'All rights reserved.'}</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href="/privacy" className="hover:text-white transition-colors">{t.footer?.links?.privacyPolicy ?? 'Privacy'}</a>
              <a href="/terms" className="hover:text-white transition-colors">{t.footer?.links?.termsOfService ?? 'Terms'}</a>
              <a href="/cookies" className="hover:text-white transition-colors">{t.footer?.links?.cookiePolicy ?? 'Cookies'}</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
