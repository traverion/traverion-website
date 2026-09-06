/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        finland: {
          DEFAULT: '#003580',
          light: '#1a4d96',
          dark: '#00285f',
        },
        ink: {
          DEFAULT: '#1c1917',
          muted: '#57534e',
          faint: '#a8a29e',
        },
        paper: {
          DEFAULT: '#f6f3ee',
          raised: '#fffcf8',
        },
      },
      screens: {
        'xs': '475px',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        heading: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        'light': '300',
        'normal': '400',
        'medium': '500',
        'semibold': '600',
      },
      // Modern easing: smooth deceleration (Airbnb / Stripe style)
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'out-smooth': 'cubic-bezier(0.33, 1, 0.68, 1)',
        'in-out-smooth': 'cubic-bezier(0.65, 0, 0.35, 1)',
        /** Editorial / luxury ease-out */
        'lux': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'lux-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'lux-page-in': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'lux-page-in-subtle': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'lux-shine': {
          '0%': { transform: 'translateX(-120%) skewX(-12deg)', opacity: '0' },
          '35%': { opacity: '0.35' },
          '100%': { transform: 'translateX(220%) skewX(-12deg)', opacity: '0' },
        },
        /** Staff login: invalid password */
        'admin-denied-glow': {
          '0%, 100%': { boxShadow: '0 0 16px rgba(248, 113, 113, 0.18)' },
          '50%': { boxShadow: '0 0 28px rgba(248, 113, 113, 0.42)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.33, 1, 0.68, 1) forwards',
        'fade-in-down': 'fade-in-down 0.35s cubic-bezier(0.33, 1, 0.68, 1) forwards',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.33, 1, 0.68, 1) forwards',
        'slide-down': 'slide-down 0.3s cubic-bezier(0.33, 1, 0.68, 1) forwards',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.33, 1, 0.68, 1) forwards',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'lux-page-in': 'lux-page-in 0.58s cubic-bezier(0.22, 1, 0.36, 1) both',
        'lux-page-in-subtle': 'lux-page-in-subtle 0.35s ease-out both',
        'lux-shine': 'lux-shine 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'admin-denied-glow': 'admin-denied-glow 2.4s ease-in-out infinite',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
        '400': '400ms',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.06)',
        'soft-lg': '0 4px 20px rgba(0,0,0,0.08)',
        'soft-xl': '0 8px 32px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
};
