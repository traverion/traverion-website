/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        finland: {
          DEFAULT: '#003580',
          light: '#0047AB',
          dark: '#002F6C',
        },
      },
      screens: {
        'xs': '475px',
      },
      fontFamily: {
        'sans': ['Open Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        'display': ['Open Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'heading': ['Open Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'body': ['Open Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontWeight: {
        'light': '300',
        'normal': '400',
        'medium': '500',
        'semibold': '600',
      }
    },
  },
  plugins: [],
};
