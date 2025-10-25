// TRAVERION BRAND GUIDELINES
// Ensuring unique, copyright-safe design and messaging

export const BRAND_COLORS = {
  // PRIMARY COLORS - Sky theme (unique to Traverion)
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9', // Main primary
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  
  // SECONDARY COLORS - Deep blue (trust, premium)
  secondary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af', // Main secondary
    900: '#1e3a8a',
  },
  
  // ACCENT COLORS - Purple gradient (innovation, luxury)
  accent: {
    purple: '#8b5cf6',
    pink: '#ec4899',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
  },
  
  // NEUTRAL COLORS - Sophisticated grays
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  
  // SUCCESS COLORS - Green (sustainability, eco-friendly)
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  // AVOIDED COLORS - Copyright safety
  avoided: {
    orange: '#ff6b35', // TUI trademark color
    yellow: '#ffd700', // Aurinkomatkat trademark color
    red: '#dc2626', // Overused in travel industry
  }
};

export const BRAND_TYPOGRAPHY = {
  // PRIMARY FONT - Inter (modern, tech-forward)
  primary: {
    fontFamily: 'Inter, system-ui, sans-serif',
    weights: [300, 400, 500, 600, 700, 800],
    usage: 'Body text, UI elements, navigation',
  },
  
  // HEADING FONT - Playfair Display (elegant, luxury)
  heading: {
    fontFamily: 'Playfair Display, serif',
    weights: [400, 500, 600, 700, 800],
    usage: 'Headlines, hero text, luxury messaging',
  },
  
  // ACCENT FONT - Poppins (friendly, premium)
  accent: {
    fontFamily: 'Poppins, system-ui, sans-serif',
    weights: [300, 400, 500, 600, 700],
    usage: 'Buttons, labels, accent text',
  },
  
  // AVOIDED FONTS - Copyright safety
  avoided: [
    'Helvetica', // Overused by competitors
    'Arial', // Generic, corporate feel
    'Times New Roman', // Outdated, corporate
    'Georgia', // Too traditional
  ]
};

export const BRAND_MESSAGING = {
  // UNIQUE VALUE PROPOSITIONS
  valueProps: [
    'Luxury travel experiences with AI-powered personalization',
    'Authentic Southeast Asian adventures with cultural immersion',
    'Sustainable tourism that supports local communities',
    'Premium service with transparent, dynamic pricing',
    'Technology-first travel platform with unique features',
  ],
  
  // UNIQUE FEATURES
  features: [
    'AI-Powered Recommendations',
    'Dynamic Pricing Engine',
    'Interactive Maps & Virtual Tours',
    'Real-Time Chat Support',
    'Sustainability Tracking',
    'Cultural Immersion Focus',
    'Premium Accommodations',
    'Expert Local Guides',
  ],
  
  // AVOIDED TERMINOLOGY - Copyright safety
  avoidedTerms: [
    'Package Holiday', // TUI trademark
    'Sun Holiday', // Aurinkomatkat trademark
    'Mass Tourism', // Competitor positioning
    'Budget Travel', // Not our market
    'Traditional Tours', // Outdated approach
  ],
  
  // UNIQUE TERMINOLOGY
  uniqueTerms: [
    'Luxury Experiences',
    'Cultural Immersion',
    'AI-Powered Journeys',
    'Sustainable Adventures',
    'Premium Packages',
    'Authentic Encounters',
    'Personalized Itineraries',
    'Expert Curated Tours',
  ]
};

export const BRAND_POSITIONING = {
  // TARGET MARKET
  targetMarket: {
    age: '25-45',
    income: 'Upper-middle to high income',
    values: ['Authenticity', 'Sustainability', 'Luxury', 'Innovation'],
    techSavvy: true,
    travelStyle: 'Experiential over sightseeing',
    destinations: 'Southeast Asia specialty',
  },
  
  // COMPETITIVE DIFFERENTIATION
  differentiation: {
    vsTUI: 'Luxury over mass market, AI over traditional, premium over budget',
    vsAurinkomatkat: 'Global over Finnish-focused, tech-first over traditional, Asia over Mediterranean',
    uniquePosition: 'Technology-driven luxury travel with cultural authenticity',
  },
  
  // BRAND PERSONALITY
  personality: {
    sophisticated: 'Premium, refined, elegant',
    innovative: 'Tech-forward, cutting-edge, modern',
    authentic: 'Genuine, real, culturally aware',
    sustainable: 'Responsible, ethical, community-focused',
    personal: 'Individualized, caring, attentive',
  }
};

export const BRAND_SAFETY = {
  // COPYRIGHT SAFETY CHECKLIST
  safetyChecklist: [
    '✅ No orange color schemes (TUI trademark)',
    '✅ No yellow/sun themes (Aurinkomatkat trademark)',
    '✅ No generic travel icons (overused)',
    '✅ No mass tourism messaging',
    '✅ No package holiday terminology',
    '✅ No corporate travel agency feel',
    '✅ Original logo design',
    '✅ Unique color combinations',
    '✅ Distinctive typography choices',
    '✅ Original content and messaging',
    '✅ Innovative feature set',
    '✅ Different target market',
  ],
  
  // LEGAL PROTECTION
  legalProtection: {
    trademark: 'Traverion - Unique name, not similar to competitors',
    logo: 'Original artwork, distinctive design',
    taglines: 'Original messaging, not copied',
    colors: 'Unique palette, not competitor colors',
    fonts: 'Distinctive choices, not generic',
    content: 'Original photography, copy, and features',
  }
};

export const BRAND_APPLICATION = {
  // UI COMPONENT GUIDELINES
  components: {
    buttons: {
      primary: 'Sky blue gradient with white text',
      secondary: 'White with sky blue border',
      accent: 'Purple gradient with white text',
      avoid: 'Orange, yellow, or red buttons',
    },
    cards: {
      background: 'White with subtle shadows',
      borders: 'Light gray or sky blue accents',
      avoid: 'Orange or yellow accents',
    },
    navigation: {
      background: 'White with sky blue accents',
      text: 'Dark gray with sky blue highlights',
      avoid: 'Orange or yellow navigation elements',
    }
  },
  
  // CONTENT GUIDELINES
  content: {
    tone: 'Professional but approachable, luxury but not pretentious',
    style: 'Tech-savvy but human, global but culturally sensitive',
    messaging: 'Premium but accessible, innovative but reliable',
    avoid: 'Corporate jargon, mass market language, generic travel terms',
  }
};

// Export all brand guidelines for easy access
export const BRAND_GUIDELINES = {
  colors: BRAND_COLORS,
  typography: BRAND_TYPOGRAPHY,
  messaging: BRAND_MESSAGING,
  positioning: BRAND_POSITIONING,
  safety: BRAND_SAFETY,
  application: BRAND_APPLICATION,
};

export default BRAND_GUIDELINES;



