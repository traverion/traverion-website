import { useState } from 'react';
import { Search, BookOpen } from 'lucide-react';
import LuxuryInput from '../components/ui/LuxuryInput';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { useTranslation } from '../contexts/TranslationContext';

export default function Blog() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', name: t.blog.categories.all, count: 6 },
    { id: 'vietnam', name: t.blog.categories.vietnam, count: 2 },
    { id: 'thailand', name: t.blog.categories.thailand, count: 2 },
    { id: 'cambodia', name: t.blog.categories.cambodia, count: 1 },
    { id: 'indochina', name: t.blog.categories.indochina, count: 1 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.laos}
        overlay="slateSoft"
        eyebrow={t.blog.hero.badge}
        title={t.blog.hero.title}
        subtitle={t.blog.hero.subtitle}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="max-w-4xl mx-auto mb-10">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <LuxuryInput
                type="search"
                placeholder={t.blog.search}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search size={20} />}
                onClear={() => setSearchTerm('')}
              />
            </div>
            <div className="md:w-64">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-finland focus:border-transparent transition-all shadow-sm"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.count})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden group">
          <div className="relative h-48 sm:h-56">
            <img
              src={HERO_IMG.beach}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/90 to-transparent" aria-hidden />
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-white/90">
              <BookOpen className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold uppercase tracking-wide">Editorial</span>
            </div>
          </div>
          <div className="p-6 sm:p-8 space-y-4 text-gray-700">
            <h2 className="text-2xl font-bold text-gray-900">Stories are on the way</h2>
            <p className="leading-relaxed">
              We are building a library of destination guides, seasonal travel tips, and real stories from
              travelers who have explored with Traverion. You will find practical advice on visas, packing,
              local etiquette, and how to pick the right tour pace for your group.
            </p>
            <p className="leading-relaxed">
              Follow us on social channels for updates, and check back here as we publish long-form articles
              about Vietnam, Thailand, Cambodia, and multi-country Indochina routes — written with the same
              care we put into every itinerary on our platform.
            </p>
            <p className="text-sm text-gray-500 pt-2">
              Tip: use the search and category filters above once articles are live; for now they help us
              test the layout you will use later.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
