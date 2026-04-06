# TRAVERION - Beyond Ordinary Travel

A modern, luxury travel website built with React, TypeScript, and Tailwind CSS, featuring beautiful tour packages and seamless booking experiences.

## 🚀 Features

- **Luxury Travel Packages**: 6 comprehensive holiday packages to Southeast Asia
- **Clean, Modern Design**: Inspired by premium travel websites like VietLong Travel
- **Responsive Layout**: Optimized for desktop, tablet, and mobile devices
- **Interactive Itineraries**: Detailed day-by-day tour breakdowns with enhanced visuals
- **Booking System**: Professional booking forms with inquiry management
- **Multilingual Support**: English and Finnish translations
- **Smooth Animations**: Beautiful transitions and hover effects

## 📦 Tour Packages

1. **Vietnam Southern 9 Days** - Ho Chi Minh City, Mekong Delta, Phu Quoc
2. **Thailand 10 Days** - Bangkok, Chiang Mai, Phuket
3. **Vietnam Complete 12 Days** - Hanoi, Halong Bay, Hoi An, Ho Chi Minh City
4. **Cambodia 10 Days** - Siem Reap, Angkor Wat, Koh Rong
5. **Indochina 14 Days** - Vietnam, Cambodia, Thailand comprehensive tour
6. **Thailand & Vietnam 14 Days** - Bangkok, Ho Chi Minh City, Hoi An, Hanoi, Halong Bay

## 🛠️ Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Custom Components** for luxury UI elements

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd traverion-main
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (buttons, cards, etc.)
│   ├── CleanTourLayout.tsx
│   ├── EnhancedItinerary.tsx
│   ├── UnifiedHeader.tsx
│   └── ...
├── pages/              # Page components
│   ├── Home.tsx
│   ├── Packages.tsx
│   ├── BeautifulTourPackage.tsx
│   └── tour pages...
├── data/               # Tour data and content
│   └── tours.ts
├── contexts/           # React contexts
│   └── TranslationContext.tsx
├── types/              # TypeScript type definitions
│   └── tour.ts
└── translations/       # Translation files
    ├── en.ts
    └── fi.ts
```

## 🎨 Design System

### Colors
- **Primary Blue**: #2563eb (blue-600)
- **Secondary Blue**: #1d4ed8 (blue-700)
- **Accent**: #f59e0b (amber-500)
- **Text**: #1f2937 (gray-900)
- **Background**: #f8fafc (slate-50)

### Typography
- **Font**: Open Sans Light (300)
- **Headings**: Bold weights for impact
- **Body**: Light weight for elegance

## 🌐 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Vercel will automatically detect the Vite framework
3. Deploy with zero configuration

### Manual Build

```bash
npm run build
npm run preview
```

## 📱 Responsive Design

- **Mobile First**: Optimized for mobile devices
- **Tablet**: Enhanced layouts for medium screens
- **Desktop**: Full-featured experience for large screens
- **Touch Friendly**: Optimized for touch interactions

## 🔧 Customization

### Adding New Tours

1. Add tour data to `src/data/tours.ts`
2. Create a new page component in `src/pages/`
3. Update routing in `src/App.tsx`

### Styling

- Use Tailwind CSS classes for styling
- Custom components in `src/components/ui/`
- Global styles in `src/index.css`

## 📄 License

This project is proprietary and confidential.

## 🤝 Support

For support and questions, contact:
- Email: info@traverion.com

---

**TRAVERION - Beyond Ordinary Travel** ✈️