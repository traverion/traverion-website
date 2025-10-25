/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
