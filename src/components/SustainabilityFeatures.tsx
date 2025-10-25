import { useState } from 'react';
import { Leaf, Recycle, Heart, Users, TreePine, Water, Sun, Wind, Car, Plane, Hotel, Utensils, Award, CheckCircle, Globe, Zap } from 'lucide-react';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryButton from './ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

interface SustainabilityFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'environmental' | 'social' | 'economic';
  impact: 'high' | 'medium' | 'low';
  co2Saved?: number; // kg CO2 saved
  certifications?: string[];
}

interface SustainabilityFeaturesProps {
  tourId: string;
  className?: string;
}

export default function SustainabilityFeatures({ tourId, className = '' }: SustainabilityFeaturesProps) {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'environmental' | 'social' | 'economic'>('all');
  const [showImpactDetails, setShowImpactDetails] = useState(false);

  const sustainabilityFeatures: SustainabilityFeature[] = [
    // Environmental Features
    {
      id: 'eco-accommodation',
      title: 'Eco-Friendly Accommodations',
      description: 'Stay in certified green hotels and eco-lodges that use renewable energy, water conservation systems, and sustainable materials.',
      icon: <Hotel className="w-8 h-8" />,
      category: 'environmental',
      impact: 'high',
      co2Saved: 15,
      certifications: ['Green Key', 'EarthCheck', 'LEED'],
    },
    {
      id: 'carbon-offset',
      title: 'Carbon Offset Programs',
      description: 'All flights and transportation are automatically offset through verified carbon reduction projects including reforestation and renewable energy.',
      icon: <TreePine className="w-8 h-8" />,
      category: 'environmental',
      impact: 'high',
      co2Saved: 120,
      certifications: ['Gold Standard', 'VCS'],
    },
    {
      id: 'sustainable-transport',
      title: 'Sustainable Transportation',
      description: 'Use of electric vehicles, hybrid cars, and public transportation where possible. Walking and cycling tours in cities.',
      icon: <Car className="w-8 h-8" />,
      category: 'environmental',
      impact: 'medium',
      co2Saved: 25,
      certifications: ['ISO 14001'],
    },
    {
      id: 'plastic-free',
      title: 'Plastic-Free Travel',
      description: 'Provision of reusable water bottles, biodegradable toiletries, and elimination of single-use plastics throughout the journey.',
      icon: <Recycle className="w-8 h-8" />,
      category: 'environmental',
      impact: 'medium',
      co2Saved: 8,
      certifications: ['Plastic Free'],
    },
    {
      id: 'local-food',
      title: 'Local & Organic Cuisine',
      description: 'Support local farmers and restaurants serving organic, locally-sourced ingredients. Reduce food miles and support sustainable agriculture.',
      icon: <Utensils className="w-8 h-8" />,
      category: 'environmental',
      impact: 'medium',
      co2Saved: 12,
      certifications: ['Organic Certified'],
    },
    {
      id: 'renewable-energy',
      title: 'Renewable Energy Use',
      description: 'Partner hotels and facilities powered by solar, wind, or hydroelectric energy. Charging stations for electric vehicles.',
      icon: <Sun className="w-8 h-8" />,
      category: 'environmental',
      impact: 'high',
      co2Saved: 35,
      certifications: ['RE100', 'Solar Powered'],
    },

    // Social Features
    {
      id: 'local-communities',
      title: 'Local Community Support',
      description: 'Direct support to local communities through fair wages, cultural preservation programs, and community development initiatives.',
      icon: <Users className="w-8 h-8" />,
      category: 'social',
      impact: 'high',
      certifications: ['Fair Trade', 'Community Tourism'],
    },
    {
      id: 'cultural-preservation',
      title: 'Cultural Heritage Protection',
      description: 'Support local artisans, traditional crafts, and cultural sites. Ensure tourism benefits local communities while preserving traditions.',
      icon: <Heart className="w-8 h-8" />,
      category: 'social',
      impact: 'high',
      certifications: ['UNESCO', 'Cultural Heritage'],
    },
    {
      id: 'fair-wages',
      title: 'Fair Trade Practices',
      description: 'Ensure all local guides, drivers, and service providers receive fair wages and work in safe conditions with proper benefits.',
      icon: <Award className="w-8 h-8" />,
      category: 'social',
      impact: 'high',
      certifications: ['Fair Trade Tourism', 'WTTC'],
    },
    {
      id: 'education-programs',
      title: 'Educational Impact',
      description: 'Support local schools and education programs. Provide learning opportunities about sustainability and environmental protection.',
      icon: <Globe className="w-8 h-8" />,
      category: 'social',
      impact: 'medium',
      certifications: ['Education First'],
    },

    // Economic Features
    {
      id: 'local-business',
      title: 'Local Business Support',
      description: 'Prioritize local businesses, restaurants, and service providers to ensure tourism revenue stays within the destination communities.',
      icon: <Users className="w-8 h-8" />,
      category: 'economic',
      impact: 'high',
      certifications: ['Local First'],
    },
    {
      id: 'sustainable-investment',
      title: 'Sustainable Investment',
      description: 'Invest in local infrastructure, conservation projects, and sustainable development initiatives in destination communities.',
      icon: <Zap className="w-8 h-8" />,
      category: 'economic',
      impact: 'high',
      certifications: ['Impact Investment'],
    },
  ];

  const filteredFeatures = selectedCategory === 'all' 
    ? sustainabilityFeatures 
    : sustainabilityFeatures.filter(feature => feature.category === selectedCategory);

  const totalCO2Saved = sustainabilityFeatures.reduce((sum, feature) => sum + (feature.co2Saved || 0), 0);
  const environmentalFeatures = sustainabilityFeatures.filter(f => f.category === 'environmental').length;
  const socialFeatures = sustainabilityFeatures.filter(f => f.category === 'social').length;
  const economicFeatures = sustainabilityFeatures.filter(f => f.category === 'economic').length;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'environmental': return 'from-green-500 to-emerald-500';
      case 'social': return 'from-blue-500 to-cyan-500';
      case 'economic': return 'from-purple-500 to-pink-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Sustainability Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <Leaf className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            Sustainable Travel with Traverion
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Experience luxury travel while making a positive impact on the environment, 
            local communities, and sustainable development.
          </p>
        </div>

        {/* Impact Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-green-600 mb-1">{totalCO2Saved}kg</div>
            <div className="text-sm text-gray-600">CO₂ Saved</div>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-blue-600 mb-1">{environmentalFeatures}</div>
            <div className="text-sm text-gray-600">Environmental</div>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-purple-600 mb-1">{socialFeatures}</div>
            <div className="text-sm text-gray-600">Social Impact</div>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-pink-600 mb-1">{economicFeatures}</div>
            <div className="text-sm text-gray-600">Economic</div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-6 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
              selectedCategory === 'all'
                ? 'bg-green-500 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-green-50'
            }`}
          >
            All Features ({sustainabilityFeatures.length})
          </button>
          <button
            onClick={() => setSelectedCategory('environmental')}
            className={`px-6 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
              selectedCategory === 'environmental'
                ? 'bg-green-500 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-green-50'
            }`}
          >
            🌱 Environmental ({environmentalFeatures})
          </button>
          <button
            onClick={() => setSelectedCategory('social')}
            className={`px-6 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
              selectedCategory === 'social'
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-blue-50'
            }`}
          >
            👥 Social ({socialFeatures})
          </button>
          <button
            onClick={() => setSelectedCategory('economic')}
            className={`px-6 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
              selectedCategory === 'economic'
                ? 'bg-purple-500 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-purple-50'
            }`}
          >
            💰 Economic ({economicFeatures})
          </button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFeatures.map((feature) => (
          <LuxuryCard key={feature.id} variant="elevated" className="p-6 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-start space-x-4">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${getCategoryColor(feature.category)} text-white flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                {feature.icon}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-lg">{feature.title}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getImpactColor(feature.impact)}`}>
                    {feature.impact}
                  </span>
                </div>
                
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  {feature.description}
                </p>

                {feature.co2Saved && (
                  <div className="flex items-center text-green-600 text-sm mb-3">
                    <TreePine className="w-4 h-4 mr-1" />
                    <span>Saves {feature.co2Saved}kg CO₂</span>
                  </div>
                )}

                {feature.certifications && (
                  <div className="flex flex-wrap gap-1">
                    {feature.certifications.slice(0, 2).map((cert, index) => (
                      <span
                        key={index}
                        className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full"
                      >
                        {cert}
                      </span>
                    ))}
                    {feature.certifications.length > 2 && (
                      <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                        +{feature.certifications.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </LuxuryCard>
        ))}
      </div>

      {/* Impact Details */}
      <LuxuryCard variant="glass" className="p-8">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-heading font-bold text-gray-900 mb-4">
            Your Travel Impact
          </h3>
          <p className="text-gray-600">
            See how your choice to travel sustainably makes a real difference
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6 bg-green-50 rounded-xl">
            <TreePine className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h4 className="font-semibold text-gray-900 mb-2">Carbon Footprint</h4>
            <p className="text-3xl font-bold text-green-600 mb-2">-{totalCO2Saved}kg</p>
            <p className="text-sm text-gray-600">CO₂ emissions saved</p>
          </div>
          
          <div className="text-center p-6 bg-blue-50 rounded-xl">
            <Users className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h4 className="font-semibold text-gray-900 mb-2">Community Impact</h4>
            <p className="text-3xl font-bold text-blue-600 mb-2">100%</p>
            <p className="text-sm text-gray-600">Local business support</p>
          </div>
          
          <div className="text-center p-6 bg-purple-50 rounded-xl">
            <Heart className="w-12 h-12 text-purple-600 mx-auto mb-4" />
            <h4 className="font-semibold text-gray-900 mb-2">Cultural Preservation</h4>
            <p className="text-3xl font-bold text-purple-600 mb-2">Active</p>
            <p className="text-sm text-gray-600">Heritage protection</p>
          </div>
        </div>

        <div className="text-center mt-6">
          <LuxuryButton
            variant="gradient"
            size="lg"
            onClick={() => setShowImpactDetails(!showImpactDetails)}
            className="group"
          >
            <span>Learn More About Our Impact</span>
            <CheckCircle className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
          </LuxuryButton>
        </div>

        {showImpactDetails && (
          <div className="mt-8 p-6 bg-gray-50 rounded-xl">
            <h4 className="font-semibold text-gray-900 mb-4">Detailed Impact Report</h4>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Carbon offset through reforestation:</span>
                <span className="font-medium">120kg CO₂</span>
              </div>
              <div className="flex justify-between">
                <span>Renewable energy usage:</span>
                <span className="font-medium">35kg CO₂</span>
              </div>
              <div className="flex justify-between">
                <span>Local business support:</span>
                <span className="font-medium">85% of revenue</span>
              </div>
              <div className="flex justify-between">
                <span>Fair wages paid:</span>
                <span className="font-medium">€2,400+</span>
              </div>
              <div className="flex justify-between">
                <span>Cultural sites supported:</span>
                <span className="font-medium">12 locations</span>
              </div>
            </div>
          </div>
        )}
      </LuxuryCard>
    </div>
  );
}



