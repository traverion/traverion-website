import { MapPin, Phone, Mail, Clock, Facebook, Instagram, Twitter, Youtube, Heart, Star, Award, Shield } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white relative overflow-hidden z-10">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="relative z-10">
        {/* Main Footer Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
            {/* Company Info */}
            <div className="lg:col-span-2">
              <div className="flex items-center mb-6 group">
                <img
                  src="/traveriontransparent.png"
                  alt="Traverion"
                  className="h-12 w-auto transition-transform duration-300 group-hover:scale-105"
                />
                    <div className="ml-4">
                      <h3 className="text-2xl font-bold bg-gradient-to-r from-slate-300 to-gray-400 bg-clip-text text-transparent">
                        TRAVERION
                      </h3>
                      <p className="text-sm text-gray-400">Beyond Ordinary Travel</p>
                    </div>
              </div>
              
              <p className="text-gray-300 mb-8 leading-relaxed max-w-md">
                {t.footer.description}
              </p>

              {/* Trust Indicators */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="text-center p-4 bg-white/5 rounded-xl backdrop-blur-sm">
                      <Award className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">{t.footer.premiumService}</p>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-xl backdrop-blur-sm">
                      <Shield className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">{t.footer.secureBooking}</p>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-xl backdrop-blur-sm">
                      <Star className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">{t.footer.fiveStarService}</p>
                    </div>
              </div>

              {/* Social Links */}
              <div className="flex space-x-4">
                <a href="#" className="p-3 bg-white/10 hover:bg-sky-500 rounded-xl transition-all duration-300 hover:scale-110 group">
                  <Facebook className="w-5 h-5 text-gray-400 group-hover:text-white" />
                </a>
                <a href="#" className="p-3 bg-white/10 hover:bg-pink-500 rounded-xl transition-all duration-300 hover:scale-110 group">
                  <Instagram className="w-5 h-5 text-gray-400 group-hover:text-white" />
                </a>
                <a href="#" className="p-3 bg-white/10 hover:bg-blue-500 rounded-xl transition-all duration-300 hover:scale-110 group">
                  <Twitter className="w-5 h-5 text-gray-400 group-hover:text-white" />
                </a>
                <a href="#" className="p-3 bg-white/10 hover:bg-red-500 rounded-xl transition-all duration-300 hover:scale-110 group">
                  <Youtube className="w-5 h-5 text-gray-400 group-hover:text-white" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-xl font-bold mb-6 text-white">{t.footer.quickLinks}</h3>
              <ul className="space-y-4">
                {[
                  { name: t.footer.links.aboutUs, href: '#' },
                  { name: t.footer.links.destinations, href: '#' },
                  { name: t.footer.links.travelPackages, href: '#' },
                  { name: t.footer.links.blogStories, href: '#' },
                  { name: t.footer.links.travelGuides, href: '#' },
                  { name: t.footer.links.customerReviews, href: '#' },
                ].map((link, index) => (
                  <li key={index}>
                    <a 
                      href={link.href} 
                      className="text-gray-300 hover:text-sky-400 transition-colors duration-300 hover:translate-x-1 inline-block"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact Info */}
            <div>
              <h3 className="text-xl font-bold mb-6 text-white">{t.footer.getInTouch}</h3>
              <div className="space-y-4">
                    <div className="flex items-start group">
                      <div className="p-2 bg-amber-500/20 rounded-lg mr-4 group-hover:bg-amber-500/30 transition-colors">
                        <Phone className="text-amber-400" size={18} />
                      </div>
                  <div>
                    <p className="text-gray-300 font-medium">{t.footer.contact.phone}</p>
                    <p className="text-sm text-gray-400">{t.footer.contact.phoneHours}</p>
                  </div>
                </div>

                    <div className="flex items-start group">
                      <div className="p-2 bg-amber-500/20 rounded-lg mr-4 group-hover:bg-amber-500/30 transition-colors">
                        <Mail className="text-amber-400" size={18} />
                      </div>
                  <div>
                    <p className="text-gray-300 font-medium">{t.footer.contact.email}</p>
                    <p className="text-sm text-gray-400">{t.footer.contact.emailResponse}</p>
                  </div>
                </div>

                    <div className="flex items-start group">
                      <div className="p-2 bg-amber-500/20 rounded-lg mr-4 group-hover:bg-amber-500/30 transition-colors">
                        <MapPin className="text-amber-400" size={18} />
                      </div>
                  <div>
                    <p className="text-gray-300 font-medium">{t.footer.contact.location}</p>
                    <p className="text-sm text-gray-400">{t.footer.contact.locationService}</p>
                  </div>
                </div>
              </div>

                  {/* Newsletter Signup */}
                  <div className="mt-8 p-6 bg-gradient-to-r from-amber-500/10 to-amber-600/10 rounded-xl backdrop-blur-sm">
                <h4 className="font-semibold mb-3 text-white">{t.footer.stayUpdated}</h4>
                <p className="text-sm text-gray-300 mb-4">{t.footer.newsletterText}</p>
                <div className="flex space-x-2">
                  <input
                    type="email"
                    placeholder={t.footer.yourEmail}
                    className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <LuxuryButton size="sm" variant="gradient">
                    <Heart className="w-4 h-4" />
                  </LuxuryButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="flex items-center space-x-6">
                <p className="text-gray-400 text-sm">
                  © {currentYear} TRAVERION. {t.footer.rights}.
                </p>
                    <div className="flex items-center space-x-1 text-amber-400">
                      <Heart className="w-4 h-4" />
                      <span className="text-sm">{t.footer.madeWithLove}</span>
                    </div>
              </div>
              
              <div className="flex items-center space-x-6">
                <a href="#" className="text-gray-400 hover:text-amber-400 text-sm transition-colors">{t.footer.links.privacyPolicy}</a>
                <a href="#" className="text-gray-400 hover:text-amber-400 text-sm transition-colors">{t.footer.links.termsOfService}</a>
                <a href="#" className="text-gray-400 hover:text-amber-400 text-sm transition-colors">{t.footer.links.cookiePolicy}</a>
                <div className="flex items-center space-x-1">
                  <span className="text-gray-400 text-sm">{t.footer.secure}</span>
                  <Shield className="w-4 h-4 text-green-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}