import { ArrowLeft, FileText } from 'lucide-react';

const LINKS = [
  { section: 'Main', items: [
    { label: 'Home', href: '/' },
    { label: 'Tours & activities', href: '/packages' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ]},
  { section: 'Legal & support', items: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms and Conditions', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
  ]},
  { section: 'Company', items: [
    { label: 'About Us', href: '/about' },
  ]},
  { section: 'For partners', items: [
    { label: 'Become a supplier', href: '/supplier' },
  ]},
];

export default function Sitemap() {
  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-finland mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sitemap</h1>
        <p className="text-gray-600 mb-8">Find all main pages and links.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {LINKS.map(({ section, items }) => (
            <div key={section} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-finland" />
                {section}
              </h2>
              <ul className="space-y-2">
                {items.map(({ label, href }) => (
                  <li key={href}>
                    <a href={href} className="text-finland hover:underline">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
