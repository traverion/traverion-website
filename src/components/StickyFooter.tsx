import { Facebook, Instagram, Twitter, Youtube, Heart, Star, Award, Shield } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';

export default function StickyFooter() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <div className="bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 text-white py-2 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
          {/* Left - Copyright */}
          <div className="flex items-center space-x-4">
            <span className="text-gray-300">
              © {currentYear} TRAVERION. {t.stickyFooter.copyright}
            </span>
            <div className="flex items-center space-x-1 text-sky-400">
              <Heart className="w-3 h-3" />
              <span className="text-xs">{t.stickyFooter.madeWithLove}</span>
            </div>
          </div>

          {/* Center - Quick Links */}
          <div className="hidden md:flex items-center space-x-4">
            <a href="#" className="text-gray-300 hover:text-sky-400 text-xs transition-colors">{t.stickyFooter.quickLinks.privacy}</a>
            <a href="#" className="text-gray-300 hover:text-sky-400 text-xs transition-colors">{t.stickyFooter.quickLinks.terms}</a>
            <a href="#" className="text-gray-300 hover:text-sky-400 text-xs transition-colors">{t.stickyFooter.quickLinks.cookies}</a>
          </div>

          {/* Right - Social & Security */}
          <div className="flex items-center space-x-4">
            {/* Social Links */}
            <div className="flex items-center space-x-2">
              <a href="#" className="p-1 hover:bg-white/10 rounded transition-colors">
                <Facebook className="w-3 h-3 text-gray-300 hover:text-white" />
              </a>
              <a href="#" className="p-1 hover:bg-white/10 rounded transition-colors">
                <Instagram className="w-3 h-3 text-gray-300 hover:text-white" />
              </a>
              <a href="#" className="p-1 hover:bg-white/10 rounded transition-colors">
                <Twitter className="w-3 h-3 text-gray-300 hover:text-white" />
              </a>
              <a href="#" className="p-1 hover:bg-white/10 rounded transition-colors">
                <Youtube className="w-3 h-3 text-gray-300 hover:text-white" />
              </a>
            </div>
            
            {/* Security Badge */}
            <div className="flex items-center space-x-1">
              <span className="text-gray-300 text-xs">{t.stickyFooter.secure}</span>
              <Shield className="w-3 h-3 text-green-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
