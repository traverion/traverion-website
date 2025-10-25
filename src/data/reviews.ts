export interface Review {
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

export const reviews: Review[] = [
  {
    id: '1',
    customerName: 'Anna Virtanen',
    customerAvatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg',
    customerLocation: 'Helsinki, Finland',
    tourTitle: '9-Day Southern Vietnam',
    rating: 5,
    date: '2024-01-15',
    title: 'Absolutely Amazing Experience!',
    comment: 'This tour exceeded all my expectations. The guide was knowledgeable and friendly, the accommodations were luxurious, and the itinerary was perfectly planned. The Mekong Delta cruise was breathtaking, and Phu Quoc Island was paradise. Highly recommended!',
    images: [
      'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
      'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
    ],
    likes: 12,
    verified: true,
    helpful: 8,
    aspects: {
      guide: 5,
      accommodation: 5,
      transportation: 5,
      overall: 5,
    },
  },
  {
    id: '2',
    customerName: 'Mikael Johansson',
    customerAvatar: 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg',
    customerLocation: 'Stockholm, Sweden',
    tourTitle: '12-Day Complete Vietnam',
    rating: 5,
    date: '2024-01-12',
    title: 'Perfect Introduction to Vietnam',
    comment: 'This comprehensive tour gave us the perfect introduction to Vietnam. From the bustling streets of Hanoi to the stunning Halong Bay, every moment was memorable. The local guide was excellent and helped us understand the culture deeply.',
    images: [
      'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
      'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
    ],
    likes: 15,
    verified: true,
    helpful: 11,
    aspects: {
      guide: 5,
      accommodation: 4,
      transportation: 5,
      overall: 5,
    },
  },
  {
    id: '3',
    customerName: 'Elena Petrov',
    customerAvatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg',
    customerLocation: 'Moscow, Russia',
    tourTitle: '10-Day Thailand Highlights',
    rating: 4,
    date: '2024-01-10',
    title: 'Great Mix of Culture and Relaxation',
    comment: 'Loved the combination of cultural experiences in Bangkok and Chiang Mai, followed by relaxation in Phuket. The temples were incredible, and the beach time was perfect. The only minor issue was the hotel in Chiang Mai could have been better located.',
    images: [
      'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
    ],
    likes: 8,
    verified: true,
    helpful: 6,
    aspects: {
      guide: 5,
      accommodation: 3,
      transportation: 4,
      overall: 4,
    },
  },
  {
    id: '4',
    customerName: 'David Chen',
    customerAvatar: 'https://images.pexels.com/photos/1040881/pexels-photo-1040881.jpeg',
    customerLocation: 'Toronto, Canada',
    tourTitle: '10-Day Cambodia Tour',
    rating: 5,
    date: '2024-01-08',
    title: 'Angkor Wat was Breathtaking',
    comment: 'The Angkor Wat complex is simply incredible. Our guide was a local expert who shared fascinating stories about the temples. Phnom Penh was eye-opening, and Koh Rong Island was the perfect ending to an amazing trip.',
    images: [
      'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
      'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
      'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
    ],
    likes: 18,
    verified: true,
    helpful: 14,
    aspects: {
      guide: 5,
      accommodation: 5,
      transportation: 4,
      overall: 5,
    },
  },
  {
    id: '5',
    customerName: 'Sophie Martin',
    customerAvatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg',
    customerLocation: 'Paris, France',
    tourTitle: '14-Day Indochina Highlight',
    rating: 5,
    date: '2024-01-05',
    title: 'Trip of a Lifetime!',
    comment: 'This was truly the trip of a lifetime. We covered so much ground but never felt rushed. Each destination was unique and special. The combination of Vietnam and Cambodia was perfect. The accommodations were top-notch throughout.',
    images: [
      'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
      'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
    ],
    likes: 22,
    verified: true,
    helpful: 16,
    aspects: {
      guide: 5,
      accommodation: 5,
      transportation: 5,
      overall: 5,
    },
  },
  {
    id: '6',
    customerName: 'James Wilson',
    customerAvatar: 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg',
    customerLocation: 'London, UK',
    tourTitle: '2-Week Thailand & Vietnam',
    rating: 4,
    date: '2024-01-03',
    title: 'Excellent Two-Week Adventure',
    comment: 'Great value for a two-week tour. We experienced the best of both countries. The Thai temples were incredible, and the Vietnamese culture was fascinating. The only downside was some long travel days, but it was worth it.',
    images: [
      'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg',
    ],
    likes: 9,
    verified: true,
    helpful: 7,
    aspects: {
      guide: 4,
      accommodation: 4,
      transportation: 3,
      overall: 4,
    },
  },
  {
    id: '7',
    customerName: 'Maria Garcia',
    customerAvatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg',
    customerLocation: 'Madrid, Spain',
    tourTitle: '9-Day Southern Vietnam',
    rating: 5,
    date: '2023-12-28',
    title: 'Perfect First Trip to Vietnam',
    comment: 'This was my first trip to Vietnam and it was perfect. The tour was well-organized, the food was amazing, and the people were so friendly. Phu Quoc Island was absolutely beautiful. I would definitely recommend this tour.',
    images: [
      'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg',
      'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
      'https://images.pexels.com/photos/2474690/pexels-photo-2474690.jpeg',
    ],
    likes: 11,
    verified: true,
    helpful: 9,
    aspects: {
      guide: 5,
      accommodation: 5,
      transportation: 5,
      overall: 5,
    },
  },
  {
    id: '8',
    customerName: 'Lars Andersen',
    customerAvatar: 'https://images.pexels.com/photos/1040881/pexels-photo-1040881.jpeg',
    customerLocation: 'Copenhagen, Denmark',
    tourTitle: '10-Day Thailand Highlights',
    rating: 4,
    date: '2023-12-25',
    title: 'Great Cultural Experience',
    comment: 'Really enjoyed the cultural aspects of this tour. The temples in Bangkok and Chiang Mai were incredible. Phuket was a nice way to end the trip. The guide was very knowledgeable about Thai history and culture.',
    images: [
      'https://images.pexels.com/photos/1006965/pexels-photo-1006965.jpeg',
    ],
    likes: 7,
    verified: true,
    helpful: 5,
    aspects: {
      guide: 5,
      accommodation: 4,
      transportation: 4,
      overall: 4,
    },
  },
];

// Helper function to get reviews for a specific tour
export const getReviewsForTour = (tourId: string): Review[] => {
  const tourTitleMap: { [key: string]: string } = {
    'vietnam-9-day': '9-Day Southern Vietnam',
    'vietnam-12-day': '12-Day Complete Vietnam',
    'thailand-10-day': '10-Day Thailand Highlights',
    'cambodia-10-day': '10-Day Cambodia Tour',
    'indochina-14-day': '14-Day Indochina Highlight',
    'thailand-vietnam-14-day': '2-Week Thailand & Vietnam',
  };

  const tourTitle = tourTitleMap[tourId];
  return reviews.filter(review => review.tourTitle === tourTitle);
};

// Helper function to get overall statistics
export const getReviewStats = (tourId: string) => {
  const tourReviews = getReviewsForTour(tourId);
  const totalReviews = tourReviews.length;
  const averageRating = totalReviews > 0 
    ? tourReviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews 
    : 0;
  
  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: tourReviews.filter(r => r.rating === star).length,
    percentage: totalReviews > 0 ? (tourReviews.filter(r => r.rating === star).length / totalReviews) * 100 : 0,
  }));

  return {
    totalReviews,
    averageRating,
    ratingDistribution,
    verifiedReviews: tourReviews.filter(r => r.verified).length,
    reviewsWithPhotos: tourReviews.filter(r => r.images.length > 0).length,
  };
};



