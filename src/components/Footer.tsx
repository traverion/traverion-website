import { Instagram } from 'lucide-react';

/** TikTok logo (Lucide has no brand icon). */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

const linkClass = 'text-gray-400 hover:text-white text-sm transition-colors duration-200 ease-smooth underline decoration-gray-500 underline-offset-2 hover:decoration-white';

/** GetYourGuide-style footer: Support, Company, Work With Us. No language/currency or app store for now. */
export default function Footer({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const nav = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    } else {
      window.location.href = page === 'home' ? '/' : `/${page}`;
    }
  };

  return (
    <footer className="bg-[#0f172a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="inline-flex items-center gap-2 mb-4">
              <img src="/traveriontransparent.png" alt="" className="h-9 w-auto" />
              <span className="font-semibold text-lg text-white">TRAVERION</span>
            </a>
            <p className="text-sm text-gray-400 max-w-xs">
              Book tours and activities worldwide. Best price guarantee.
            </p>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">Support</h3>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => nav('contact')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Contact</button></li>
              <li><button type="button" onClick={() => nav('terms')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Legal Notice</button></li>
              <li><button type="button" onClick={() => nav('privacy')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Privacy Policy</button></li>
              <li><button type="button" onClick={() => nav('cookies')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Cookies and Marketing Preferences</button></li>
              <li><button type="button" onClick={() => nav('terms')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>General Terms and Conditions</button></li>
              <li><button type="button" onClick={() => nav('sitemap')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Sitemap</button></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">Company</h3>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => nav('about')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>About Us</button></li>
              <li><button type="button" onClick={() => nav('blog')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Blog</button></li>
            </ul>
          </div>

          {/* Want to work with us? */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wide">Want to work with us?</h3>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => nav('contact')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Become an affiliate</button></li>
              <li><button type="button" onClick={() => nav('contact')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Become a content creator</button></li>
              <li><a href="/supplier-log-in" className={linkClass}>Become a supplier</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar – copyright + social */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-sm text-gray-500 text-center sm:text-left">
            © 2026 Traverion – Original from Finland
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://instagram.com/traverion"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              aria-label="Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="https://tiktok.com/@traverion"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              aria-label="TikTok"
            >
              <TikTokIcon className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
