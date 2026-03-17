import { useState, useEffect } from 'react';
import { Brain, Sparkles, TrendingUp, Clock, Star, MapPin, Calendar, Users, Heart, Filter, RefreshCw, Zap, Target, Award, Lightbulb } from 'lucide-react';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryButton from './ui/LuxuryButton';
import PackageCard from './PackageCard';
import { tourPackages } from '../data/tours';
import { TourPackage } from '../types/tour';
import { useTranslation } from '../contexts/TranslationContext';

interface UserPreferences {
  destinations: string[];
  activities: string[];
  budget: 'low' | 'medium' | 'high' | 'luxury';
  duration: 'short' | 'medium' | 'long';
  groupSize: 'solo' | 'couple' | 'small' | 'large';
  travelStyle: 'adventure' | 'cultural' | 'relaxation' | 'luxury' | 'eco-friendly';
  interests: string[];
  age: 'young' | 'adult' | 'senior';
  experience: 'beginner' | 'intermediate' | 'expert';
}

interface AIRecommendation {
  tour: TourPackage;
  score: number;
  reasons: string[];
  matchPercentage: number;
  personalizedMessage: string;
  tags: string[];
}

interface AIRecommendationsProps {
  className?: string;
  onTourSelect?: (tour: TourPackage) => void;
}

export default function AIRecommendations({ className = '', onTourSelect }: AIRecommendationsProps) {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<UserPreferences>({
    destinations: [],
    activities: [],
    budget: 'medium',
    duration: 'medium',
    groupSize: 'couple',
    travelStyle: 'luxury',
    interests: [],
    age: 'adult',
    experience: 'intermediate'
  });
  
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPreferences, setShowPreferences] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // AI Recommendation Engine
  const calculateTourScore = (tour: TourPackage, userPrefs: UserPreferences): AIRecommendation => {
    let score = 0;
    const reasons: string[] = [];
    let matchPercentage = 0;

    // Destination matching (30% weight)
    const destinationMatch = userPrefs.destinations.some(dest => 
      tour.destination.toLowerCase().includes(dest.toLowerCase()) ||
      tour.title.toLowerCase().includes(dest.toLowerCase())
    );
    if (destinationMatch || userPrefs.destinations.length === 0) {
      score += 30;
      if (destinationMatch) reasons.push(`Perfect match for your ${userPrefs.destinations.join(', ')} destination preference`);
    }

    // Budget matching (25% weight)
    const tourPrice = tour.price.twin;
    const budgetRanges = {
      low: { min: 0, max: 1500 },
      medium: { min: 1500, max: 2500 },
      high: { min: 2500, max: 3500 },
      luxury: { min: 3500, max: 10000 }
    };
    const budgetRange = budgetRanges[userPrefs.budget];
    if (tourPrice >= budgetRange.min && tourPrice <= budgetRange.max) {
      score += 25;
      reasons.push(`Fits perfectly within your ${userPrefs.budget} budget range`);
    } else if (tourPrice < budgetRange.min) {
      score += 15;
      reasons.push(`Great value - under your ${userPrefs.budget} budget`);
    } else {
      score += 5;
      reasons.push(`Premium option above your ${userPrefs.budget} budget`);
    }

    // Duration matching (20% weight)
    const durationMatch = {
      short: tour.duration.includes('7') || tour.duration.includes('8') || tour.duration.includes('9'),
      medium: tour.duration.includes('10') || tour.duration.includes('11') || tour.duration.includes('12'),
      long: tour.duration.includes('13') || tour.duration.includes('14') || tour.duration.includes('15')
    };
    if (durationMatch[userPrefs.duration]) {
      score += 20;
      reasons.push(`Ideal ${userPrefs.duration} duration for your schedule`);
    }

    // Travel style matching (15% weight)
    const styleMatches = {
      adventure: tour.highlights.some(h => h.toLowerCase().includes('adventure') || h.toLowerCase().includes('hiking') || h.toLowerCase().includes('exploration')),
      cultural: tour.highlights.some(h => h.toLowerCase().includes('culture') || h.toLowerCase().includes('temple') || h.toLowerCase().includes('history')),
      relaxation: tour.highlights.some(h => h.toLowerCase().includes('beach') || h.toLowerCase().includes('spa') || h.toLowerCase().includes('relax')),
      luxury: tour.rating >= 4.5 && tour.price.twin > 2000,
      'eco-friendly': tour.highlights.some(h => h.toLowerCase().includes('eco') || h.toLowerCase().includes('sustainable') || h.toLowerCase().includes('nature'))
    };
    if (styleMatches[userPrefs.travelStyle]) {
      score += 15;
      reasons.push(`Matches your ${userPrefs.travelStyle} travel style perfectly`);
    }

    // Group size matching (5% weight)
    const groupMatch = {
      solo: tour.groupSize.includes('1') || tour.groupSize.includes('small'),
      couple: tour.groupSize.includes('2') || tour.groupSize.includes('couple'),
      small: tour.groupSize.includes('small') || tour.groupSize.includes('4'),
      large: tour.groupSize.includes('large') || tour.groupSize.includes('group')
    };
    if (groupMatch[userPrefs.groupSize]) {
      score += 5;
      reasons.push(`Perfect group size for ${userPrefs.groupSize} travelers`);
    }

    // Experience level (5% weight)
    if (tour.difficulty === userPrefs.experience) {
      score += 5;
      reasons.push(`Appropriate difficulty level for ${userPrefs.experience} travelers`);
    }

    matchPercentage = Math.min(score, 100);

    // Generate personalized message
    const personalizedMessage = generatePersonalizedMessage(tour, userPrefs, reasons);

    return {
      tour,
      score,
      reasons,
      matchPercentage,
      personalizedMessage,
      tags: generateTags(tour, userPrefs)
    };
  };

  const generatePersonalizedMessage = (tour: TourPackage, prefs: UserPreferences, reasons: string[]): string => {
    const messages = [
      `Based on your love for ${prefs.travelStyle} experiences, this ${tour.destination} adventure is perfect for you!`,
      `Your ${prefs.budget} budget aligns perfectly with this luxury ${tour.destination} experience.`,
      `This ${tour.duration} journey matches your ideal ${prefs.duration} trip duration.`,
      `Perfect for ${prefs.groupSize} travelers seeking ${prefs.travelStyle} experiences.`,
      `Your interest in ${prefs.interests.join(', ')} makes this tour an ideal choice.`,
      `This ${tour.destination} experience is trending among ${prefs.age} travelers like you.`,
      `Based on your ${prefs.experience} travel experience, this tour offers the right level of adventure.`,
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const generateTags = (tour: TourPackage, prefs: UserPreferences): string[] => {
    const tags = [];
    
    if (tour.isPopular) tags.push('Trending');
    if (tour.rating >= 4.8) tags.push('Highly Rated');
    if (tour.price.twin < 2000) tags.push('Great Value');
    if (tour.price.twin > 3000) tags.push('Premium');
    if (tour.duration.includes('14')) tags.push('Extended Journey');
    if (tour.destination.includes('Vietnam')) tags.push('Cultural Rich');
    if (tour.destination.includes('Thailand')) tags.push('Tropical Paradise');
    if (tour.destination.includes('Cambodia')) tags.push('Ancient Wonders');
    
    return tags.slice(0, 3);
  };

  const generateRecommendations = async () => {
    setIsAnalyzing(true);
    
    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const scoredTours = tourPackages.map(tour => calculateTourScore(tour, preferences));
    const sortedRecommendations = scoredTours
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    
    setRecommendations(sortedRecommendations);
    setIsAnalyzing(false);
    setShowPreferences(false);
  };

  const filteredRecommendations = recommendations.filter(rec => {
    switch (selectedFilter) {
      case 'high': return rec.matchPercentage >= 80;
      case 'medium': return rec.matchPercentage >= 60 && rec.matchPercentage < 80;
      case 'low': return rec.matchPercentage < 60;
      default: return true;
    }
  });

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 bg-green-100';
    if (percentage >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getScoreIcon = (percentage: number) => {
    if (percentage >= 80) return <Sparkles className="w-4 h-4" />;
    if (percentage >= 60) return <Star className="w-4 h-4" />;
    return <Target className="w-4 h-4" />;
  };

  return (
    <div className={`space-y-8 ${className}`}>
      {/* AI Header */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-heading font-bold text-gray-900 mb-4">
            AI-Powered Travel Recommendations
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Get personalized tour recommendations based on your preferences, behavior, and travel style. 
            Our AI learns what you love to suggest perfect matches.
          </p>
        </div>

        {/* AI Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-purple-600 mb-1">95%</div>
            <div className="text-sm text-gray-600">Accuracy Rate</div>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-pink-600 mb-1">10K+</div>
            <div className="text-sm text-gray-600">Happy Customers</div>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-blue-600 mb-1">24/7</div>
            <div className="text-sm text-gray-600">AI Learning</div>
          </div>
          <div className="text-center p-4 bg-white rounded-xl shadow-sm">
            <div className="text-2xl font-bold text-green-600 mb-1">100%</div>
            <div className="text-sm text-gray-600">Personalized</div>
          </div>
        </div>
      </div>

      {/* Preferences Form */}
      {showPreferences && (
        <LuxuryCard variant="glass" className="p-8">
          <h3 className="text-2xl font-heading font-bold text-gray-900 mb-6">Tell Us About Your Dream Trip</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Preferred Destinations</label>
                <div className="flex flex-wrap gap-2">
                  {['Vietnam', 'Thailand', 'Cambodia', 'Laos', 'Myanmar'].map(dest => (
                    <button
                      key={dest}
                      onClick={() => {
                        setPreferences(prev => ({
                          ...prev,
                          destinations: prev.destinations.includes(dest)
                            ? prev.destinations.filter(d => d !== dest)
                            : [...prev.destinations, dest]
                        }));
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                        preferences.destinations.includes(dest)
                          ? 'bg-sky-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {dest}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Travel Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {['adventure', 'cultural', 'relaxation', 'luxury', 'eco-friendly'].map(style => (
                    <button
                      key={style}
                      onClick={() => setPreferences(prev => ({ ...prev, travelStyle: style as any }))}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        preferences.travelStyle === style
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Budget Range</label>
                <div className="grid grid-cols-2 gap-2">
                  {['low', 'medium', 'high', 'luxury'].map(budget => (
                    <button
                      key={budget}
                      onClick={() => setPreferences(prev => ({ ...prev, budget: budget as any }))}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        preferences.budget === budget
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {budget.charAt(0).toUpperCase() + budget.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Trip Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {['short', 'medium', 'long'].map(duration => (
                    <button
                      key={duration}
                      onClick={() => setPreferences(prev => ({ ...prev, duration: duration as any }))}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        preferences.duration === duration
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {duration.charAt(0).toUpperCase() + duration.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Group Size</label>
                <div className="grid grid-cols-2 gap-2">
                  {['solo', 'couple', 'small', 'large'].map(size => (
                    <button
                      key={size}
                      onClick={() => setPreferences(prev => ({ ...prev, groupSize: size as any }))}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        preferences.groupSize === size
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Experience Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {['beginner', 'intermediate', 'expert'].map(level => (
                    <button
                      key={level}
                      onClick={() => setPreferences(prev => ({ ...prev, experience: level as any }))}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        preferences.experience === level
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <LuxuryButton
              variant="gradient"
              size="lg"
              onClick={generateRecommendations}
              disabled={isAnalyzing}
              className="group"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  <span>AI Analyzing Your Preferences...</span>
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5 mr-2" />
                  <span>Get My Personalized Recommendations</span>
                  <Sparkles className="w-5 h-5 ml-2 transition-transform duration-300 group-hover:scale-110" />
                </>
              )}
            </LuxuryButton>
          </div>
        </LuxuryCard>
      )}

      {/* Recommendations Results */}
      {recommendations.length > 0 && (
        <div className="space-y-6">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-heading font-bold text-gray-900">
                Your Personalized Recommendations
              </h3>
              <p className="text-gray-600 mt-1">
                Based on your preferences and AI analysis
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All Matches</option>
                  <option value="high">High Match (80%+)</option>
                  <option value="medium">Medium Match (60-79%)</option>
                  <option value="low">Low Match (&lt;60%)</option>
                </select>
              </div>
              
              <LuxuryButton
                variant="outline"
                size="sm"
                onClick={() => setShowPreferences(true)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Update Preferences
              </LuxuryButton>
            </div>
          </div>

          {/* Recommendations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecommendations.map((recommendation, index) => (
              <LuxuryCard key={recommendation.tour.id} variant="elevated" className="p-6 group hover:shadow-soft-lg transition-all duration-250 ease-out-smooth">
                {/* AI Score Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(recommendation.matchPercentage)}`}>
                    {getScoreIcon(recommendation.matchPercentage)}
                    <span className="ml-1">{recommendation.matchPercentage}% Match</span>
                  </div>
                  <div className="flex space-x-1">
                    {recommendation.tags.map((tag, tagIndex) => (
                      <span key={tagIndex} className="bg-purple-100 text-purple-600 text-xs px-2 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tour Card */}
                <div className="mb-4">
                  <PackageCard
                    title={recommendation.tour.title}
                    destination={recommendation.tour.destination}
                    duration={recommendation.tour.duration}
                    groupSize={recommendation.tour.groupSize}
                    price={`$${recommendation.tour.price.twin}`}
                    image={recommendation.tour.image}
                    description={recommendation.tour.description}
                    rating={recommendation.tour.rating}
                    reviews={recommendation.tour.reviews}
                    isPopular={recommendation.tour.isPopular}
                    onViewDetails={() => onTourSelect?.(recommendation.tour)}
                    tourId={recommendation.tour.id}
                  />
                </div>

                {/* AI Insights */}
                <div className="space-y-3">
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4">
                    <div className="flex items-start space-x-2">
                      <Lightbulb className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-purple-900 mb-1">AI Insight</p>
                        <p className="text-sm text-purple-700">{recommendation.personalizedMessage}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Why This Tour Matches:</p>
                    <div className="space-y-1">
                      {recommendation.reasons.slice(0, 2).map((reason, reasonIndex) => (
                        <div key={reasonIndex} className="flex items-start">
                          <div className="w-1.5 h-1.5 bg-sky-500 rounded-full mt-2 mr-2 flex-shrink-0" />
                          <span className="text-xs text-gray-600">{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 mt-4">
                  <LuxuryButton
                    variant="gradient"
                    size="sm"
                    className="flex-1"
                    onClick={() => onTourSelect?.(recommendation.tour)}
                  >
                    <span>View Details</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </LuxuryButton>
                  <button className="p-2 text-gray-500 hover:text-red-500 transition-colors">
                    <Heart className="w-4 h-4" />
                  </button>
                </div>
              </LuxuryCard>
            ))}
          </div>

          {/* No Results */}
          {filteredRecommendations.length === 0 && (
            <div className="text-center py-12">
              <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No matches found</h4>
              <p className="text-gray-600 mb-4">Try adjusting your filter criteria or preferences</p>
              <LuxuryButton
                variant="outline"
                onClick={() => setSelectedFilter('all')}
              >
                Show All Recommendations
              </LuxuryButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
