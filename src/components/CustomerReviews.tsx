import { useState } from 'react';
import { Star, Heart, MessageCircle, Camera, MapPin, Calendar, ThumbsUp, Filter } from 'lucide-react';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryButton from './ui/LuxuryButton';
import { useTranslation } from '../contexts/TranslationContext';

interface Review {
  id: string;
  customerName: string;
  customerAvatar: string;
  customerLocation: string;
  tourTitle: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  images: string[];
  likes: number;
  verified: boolean;
  helpful: number;
  aspects: {
    guide: number;
    accommodation: number;
    transportation: number;
    overall: number;
  };
}

interface CustomerReviewsProps {
  tourId: string;
  reviews: Review[];
}

export default function CustomerReviews({ tourId, reviews }: CustomerReviewsProps) {
  const { t } = useTranslation();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showAddReview, setShowAddReview] = useState(false);

  const filters = [
    { id: 'all', label: 'All Reviews', count: reviews.length },
    { id: '5', label: '5 Stars', count: reviews.filter(r => r.rating === 5).length },
    { id: '4', label: '4 Stars', count: reviews.filter(r => r.rating === 4).length },
    { id: '3', label: '3 Stars', count: reviews.filter(r => r.rating === 3).length },
    { id: 'with-photos', label: 'With Photos', count: reviews.filter(r => r.images.length > 0).length },
    { id: 'verified', label: 'Verified', count: reviews.filter(r => r.verified).length },
  ];

  const filteredReviews = reviews.filter(review => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'with-photos') return review.images.length > 0;
    if (selectedFilter === 'verified') return review.verified;
    return review.rating.toString() === selectedFilter;
  });

  const sortedReviews = [...filteredReviews].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      case 'oldest':
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'highest-rated':
        return b.rating - a.rating;
      case 'lowest-rated':
        return a.rating - b.rating;
      case 'most-helpful':
        return b.helpful - a.helpful;
      default:
        return 0;
    }
  });

  const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    percentage: (reviews.filter(r => r.rating === star).length / reviews.length) * 100,
  }));

  const renderStars = (rating: number, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClasses = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5',
    };

    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClasses[size]} ${
              star <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Reviews Header */}
      <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Overall Rating */}
          <div className="text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start mb-4">
              <span className="text-5xl font-bold text-gray-900 mr-3">{averageRating.toFixed(1)}</span>
              <div>
                {renderStars(Math.round(averageRating), 'lg')}
                <p className="text-gray-600 mt-1">{reviews.length} reviews</p>
              </div>
            </div>
            <p className="text-gray-700">Based on verified customer reviews</p>
          </div>

          {/* Rating Distribution */}
          <div className="lg:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-4">Rating Breakdown</h3>
            <div className="space-y-2">
              {ratingDistribution.map(({ star, count, percentage }) => (
                <div key={star} className="flex items-center">
                  <span className="text-sm text-gray-600 w-8">{star}</span>
                  <Star className="w-4 h-4 text-yellow-400 fill-current mr-2" />
                  <div className="flex-1 bg-gray-200 rounded-full h-2 mx-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                selectedFilter === filter.id
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-4">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest-rated">Highest Rated</option>
            <option value="lowest-rated">Lowest Rated</option>
            <option value="most-helpful">Most Helpful</option>
          </select>

          <LuxuryButton
            variant="gradient"
            size="sm"
            onClick={() => setShowAddReview(true)}
          >
            Write Review
          </LuxuryButton>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-6">
        {sortedReviews.map((review) => (
          <LuxuryCard key={review.id} variant="elevated" className="p-6">
            <div className="flex items-start space-x-4">
              {/* Customer Avatar */}
              <img
                src={review.customerAvatar}
                alt={review.customerName}
                className="w-12 h-12 rounded-full object-cover"
              />

              {/* Review Content */}
              <div className="flex-1">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-semibold text-gray-900">{review.customerName}</h4>
                      {review.verified && (
                        <span className="bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center">
                        <MapPin size={14} className="mr-1" />
                        <span>{review.customerLocation}</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar size={14} className="mr-1" />
                        <span>{new Date(review.date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-xs bg-sky-100 text-sky-600 px-2 py-1 rounded-full">
                          {review.tourTitle}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {renderStars(review.rating)}
                    <p className="text-sm text-gray-500 mt-1">{review.rating}/5</p>
                  </div>
                </div>

                {/* Review Title */}
                <h5 className="font-semibold text-gray-900 mb-2">{review.title}</h5>

                {/* Review Comment */}
                <p className="text-gray-700 leading-relaxed mb-4">{review.comment}</p>

                {/* Review Images */}
                {review.images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    {review.images.slice(0, 4).map((image, index) => (
                      <img
                        key={index}
                        src={image}
                        alt={`Review photo ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    ))}
                    {review.images.length > 4 && (
                      <div className="w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-gray-500 text-sm">+{review.images.length - 4} more</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Rating Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Guide</p>
                    {renderStars(review.aspects.guide, 'sm')}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Accommodation</p>
                    {renderStars(review.aspects.accommodation, 'sm')}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Transportation</p>
                    {renderStars(review.aspects.transportation, 'sm')}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Overall</p>
                    {renderStars(review.aspects.overall, 'sm')}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button className="flex items-center space-x-1 text-gray-500 hover:text-sky-500 transition-colors">
                      <ThumbsUp size={16} />
                      <span className="text-sm">Helpful ({review.helpful})</span>
                    </button>
                    <button className="flex items-center space-x-1 text-gray-500 hover:text-red-500 transition-colors">
                      <Heart size={16} />
                      <span className="text-sm">Like ({review.likes})</span>
                    </button>
                  </div>
                  <button className="text-gray-500 hover:text-sky-500 transition-colors">
                    <MessageCircle size={16} />
                  </button>
                </div>
              </div>
            </div>
          </LuxuryCard>
        ))}
      </div>

      {/* Add Review Modal */}
      {showAddReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <LuxuryCard className="max-w-2xl w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-heading font-bold text-gray-900">Write a Review</h3>
              <button
                onClick={() => setShowAddReview(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Overall Rating</label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} className="text-3xl hover:scale-110 transition-transform">
                      ⭐
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Review Title</label>
                <input
                  type="text"
                  placeholder="Summarize your experience"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Review</label>
                <textarea
                  rows={4}
                  placeholder="Tell us about your experience..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Photos (Optional)</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                  <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Click to upload photos</p>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <LuxuryButton
                  variant="outline"
                  onClick={() => setShowAddReview(false)}
                >
                  Cancel
                </LuxuryButton>
                <LuxuryButton
                  variant="gradient"
                  onClick={() => {
                    // Handle review submission
                    setShowAddReview(false);
                    alert('Review submitted successfully!');
                  }}
                >
                  Submit Review
                </LuxuryButton>
              </div>
            </div>
          </LuxuryCard>
        </div>
      )}
    </div>
  );
}



