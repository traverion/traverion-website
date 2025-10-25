import { useState } from 'react';
import { Calendar, Clock, User, ArrowRight, Search, Filter, Tag, MapPin, Plane } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import LuxuryInput from '../components/ui/LuxuryInput';
import { tourPackages } from '../data/tours';
import { useTranslation } from '../contexts/TranslationContext';

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  readTime: string;
  image: string;
  category: string;
  tags: string[];
  featured: boolean;
}

export default function Blog() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const blogPosts: BlogPost[] = [
    {
      id: 1,
      title: '9-Day Southern Vietnam: From Ho Chi Minh City to Phu Quoc Paradise',
      excerpt: 'Discover the vibrant energy of Ho Chi Minh City, explore the historic Cu Chi Tunnels, cruise through the Mekong Delta, and relax on the beautiful beaches of Phu Quoc Island.',
      content: 'Experience the perfect blend of urban excitement and tropical relaxation in our 9-day Southern Vietnam tour. Start in the bustling Ho Chi Minh City, where modern skyscrapers meet traditional markets. Explore the historic Cu Chi Tunnels, a testament to Vietnamese resilience. Cruise through the Mekong Delta\'s intricate waterways and visit the famous Cai Rang floating market. End your journey on Phu Quoc Island, where pristine beaches and crystal-clear waters await. This tour offers the perfect introduction to Vietnam\'s southern charm.',
      author: 'Traverion Team',
      date: '2024-01-15',
      readTime: '8 min read',
      image: 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
      category: 'vietnam',
      tags: ['Vietnam', 'Ho Chi Minh City', 'Phu Quoc', 'Mekong Delta'],
      featured: true,
    },
    {
      id: 2,
      title: '12-Day Complete Vietnam Discovery: From Hanoi to Ho Chi Minh City',
      excerpt: 'Experience the complete beauty of Vietnam from north to south. From Hanoi\'s rich culture to Halong Bay\'s stunning landscapes, Hoi An\'s ancient charm, and Ho Chi Minh City\'s vibrant energy.',
      content: 'Our comprehensive 12-day Vietnam tour takes you through the country\'s most iconic destinations. Begin in Hanoi with its rich history and street food culture. Cruise through the stunning limestone karsts of Halong Bay. Explore the ancient town of Hoi An, a UNESCO World Heritage site. Discover the vibrant energy of Ho Chi Minh City and the historic Cu Chi Tunnels. This complete journey showcases Vietnam\'s incredible diversity and beauty.',
      author: 'Traverion Team',
      date: '2024-01-12',
      readTime: '10 min read',
      image: 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
      category: 'vietnam',
      tags: ['Vietnam', 'Hanoi', 'Halong Bay', 'Hoi An'],
      featured: true,
    },
    {
      id: 3,
      title: '10-Day Thailand Highlights: Bangkok, Chiang Mai & Phuket Adventure',
      excerpt: 'Discover Thailand\'s cultural heart in Bangkok and Chiang Mai, then unwind on the beautiful beaches of Phuket. Experience the perfect blend of culture, history, and relaxation.',
      content: 'Thailand offers an incredible diversity of experiences, and our 10-day tour captures the best of them all. Explore Bangkok\'s royal palaces and bustling markets. Experience the cultural richness of Chiang Mai with its ancient temples and traditional crafts. End your journey on Phuket\'s pristine beaches, where you can relax and enjoy water activities. This tour perfectly balances cultural immersion with beach relaxation.',
      author: 'Traverion Team',
      date: '2024-01-10',
      readTime: '7 min read',
      image: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
      category: 'thailand',
      tags: ['Thailand', 'Bangkok', 'Chiang Mai', 'Phuket'],
      featured: false,
    },
    {
      id: 4,
      title: '10-Day Cambodia Tour: Angkor Wat, Phnom Penh & Koh Rong Beach',
      excerpt: 'Discover the ancient wonders of Angkor Wat, explore the capital city of Phnom Penh, and relax on the pristine beaches of Koh Rong Island.',
      content: 'Cambodia offers a unique blend of ancient history and natural beauty. Start your journey at the magnificent Angkor Wat temple complex, one of the world\'s most impressive archaeological sites. Explore the ancient capital of Angkor Thom and the mysterious Ta Prohm temple. Experience Phnom Penh\'s rich history and culture. End your adventure on Koh Rong Island, where pristine beaches and crystal-clear waters provide the perfect setting for relaxation.',
      author: 'Traverion Team',
      date: '2024-01-08',
      readTime: '9 min read',
      image: 'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
      category: 'cambodia',
      tags: ['Cambodia', 'Angkor Wat', 'Phnom Penh', 'Koh Rong'],
      featured: false,
    },
    {
      id: 5,
      title: '14-Day Indochina Highlight Tour: Vietnam & Cambodia Adventure',
      excerpt: 'Experience the best of Indochina with this comprehensive 14-day journey through Vietnam and Cambodia. From Hanoi\'s rich culture to Angkor Wat\'s ancient wonders.',
      content: 'Our ultimate Indochina experience combines the best of Vietnam and Cambodia in one unforgettable journey. Start in Hanoi with its rich culture and history. Cruise through the stunning Halong Bay. Explore the ancient town of Hoi An. Relax on Phu Quoc\'s beautiful beaches. Discover the magnificent Angkor Wat temple complex in Cambodia. This comprehensive tour showcases the incredible diversity and beauty of Southeast Asia.',
      author: 'Traverion Team',
      date: '2024-01-05',
      readTime: '12 min read',
      image: 'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
      category: 'indochina',
      tags: ['Vietnam', 'Cambodia', 'Indochina', 'Angkor Wat'],
      featured: true,
    },
    {
      id: 6,
      title: '2-Week Thailand & Vietnam: Cultural Immersion & Beach Paradise',
      excerpt: 'Combine the best of Thailand and Vietnam in this comprehensive 2-week journey. Experience Bangkok\'s energy, Chiang Mai\'s culture, Phuket\'s beaches, and Vietnam\'s vibrant cities.',
      content: 'This comprehensive 2-week tour offers the perfect introduction to Southeast Asia. Experience Thailand\'s cultural richness in Bangkok and Chiang Mai. Relax on Phuket\'s pristine beaches. Discover Vietnam\'s vibrant cities and rich history. This tour provides an incredible diversity of experiences, from ancient temples to modern cities, from cultural immersion to beach relaxation.',
      author: 'Traverion Team',
      date: '2024-01-03',
      readTime: '11 min read',
      image: 'https://images.pexels.com/photos/1007426/pexels-photo-1007426.jpeg',
      category: 'thailand',
      tags: ['Thailand', 'Vietnam', 'Bangkok', 'Phuket'],
      featured: false,
    },
  ];

  const categories = [
    { id: 'all', name: t.blog.categories.all, count: blogPosts.length },
    { id: 'vietnam', name: t.blog.categories.vietnam, count: blogPosts.filter(post => post.category === 'vietnam').length },
    { id: 'thailand', name: t.blog.categories.thailand, count: blogPosts.filter(post => post.category === 'thailand').length },
    { id: 'cambodia', name: t.blog.categories.cambodia, count: blogPosts.filter(post => post.category === 'cambodia').length },
    { id: 'indochina', name: t.blog.categories.indochina, count: blogPosts.filter(post => post.category === 'indochina').length },
  ];

  const filteredPosts = blogPosts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const featuredPosts = blogPosts.filter(post => post.featured);

  return (
    <div className="min-h-screen bg-white pt-20">
      {/* Hero Section */}
      <section className="relative py-24 bg-gradient-to-br from-sky-50 via-white to-blue-50 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230ea5e9' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-sky-100 text-sky-600 rounded-full text-sm font-semibold mb-6 animate-fade-in-up">
              {t.blog.hero.badge}
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-bold text-gray-900 mb-6 animate-fade-in-up stagger-1">
              {t.blog.hero.title}
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed animate-fade-in-up stagger-2">
              {t.blog.hero.subtitle}
            </p>
          </div>

          {/* Search and Filter */}
          <div className="max-w-4xl mx-auto mb-16 animate-fade-in-up stagger-3">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                >
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Featured Articles</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {featuredPosts.map((post, index) => (
                <LuxuryCard
                  key={post.id}
                  variant="elevated"
                  className="group overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="relative h-64 overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ backgroundImage: `url(${post.image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute top-4 left-4">
                      <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                        Featured
                      </span>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-2xl font-bold text-white mb-2">{post.title}</h3>
                      <p className="text-white/90 text-sm line-clamp-2">{post.excerpt}</p>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <User size={16} className="mr-1" />
                          <span>{post.author}</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar size={16} className="mr-1" />
                          <span>{new Date(post.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center">
                          <Clock size={16} className="mr-1" />
                          <span>{post.readTime}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-2">
                        {post.tags.slice(0, 2).map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="px-2 py-1 bg-sky-100 text-sky-600 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <LuxuryButton variant="outline" size="sm" className="group/btn">
                        <span>{t.common.readMore}</span>
                        <ArrowRight size={16} className="ml-1 transition-transform duration-300 group-hover/btn:translate-x-1" />
                      </LuxuryButton>
                    </div>
                  </div>
                </LuxuryCard>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Posts */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              All Articles ({filteredPosts.length})
            </h2>
          </div>

          {filteredPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPosts.map((post, index) => (
                <LuxuryCard
                  key={post.id}
                  variant="default"
                  className="group overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="relative h-48 overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ backgroundImage: `url(${post.image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute top-4 right-4">
                      <span className="bg-white/90 text-gray-900 px-2 py-1 rounded-full text-xs font-medium">
                        {post.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-sky-600 transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">{post.excerpt}</p>
                    
                    <div className="flex items-center justify-between mb-4 text-xs text-gray-500">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center">
                          <User size={14} className="mr-1" />
                          <span>{post.author}</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar size={14} className="mr-1" />
                          <span>{new Date(post.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Clock size={14} className="mr-1" />
                        <span>{post.readTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {post.tags.slice(0, 2).map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <LuxuryButton variant="outline" size="sm" className="group/btn">
                        <span>Read</span>
                        <ArrowRight size={14} className="ml-1 transition-transform duration-300 group-hover/btn:translate-x-1" />
                      </LuxuryButton>
                    </div>
                  </div>
                </LuxuryCard>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Search size={48} className="mx-auto" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No articles found</h3>
              <p className="text-gray-600 mb-6">Try adjusting your search or filter criteria</p>
              <LuxuryButton
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                }}
              >
                Clear Filters
              </LuxuryButton>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
