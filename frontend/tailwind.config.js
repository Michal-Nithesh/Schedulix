/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17324a',
        ocean: '#245f78',
        teal: '#4f9a9a',
        coral: '#e9826d',
        paper: '#f7f2e8',
        mist: '#d9e8df',
        line: '#b9d2cb',
      },
      fontFamily: {
        sans: ['Trebuchet MS', 'ui-sans-serif', 'sans-serif'],
        display: ['Georgia', 'ui-serif', 'serif'],
      },
      boxShadow: {
        lift: '0 18px 50px rgba(23, 50, 74, 0.12)',
        soft: '0 8px 24px rgba(23, 50, 74, 0.08)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'float-in': {
          '0%': { opacity: '0', transform: 'scale(.96) rotate(-1deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '.45', transform: 'scale(.9)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .55s ease-out both',
        'float-in': 'float-in .6s ease-out both',
        pulse: 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
