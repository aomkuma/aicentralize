/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)'],
      display: ['var(--font-sans)'],
    },
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c2d5ff',
          300: '#a3c0ff',
          400: '#7da8ff',
          500: '#5690ff',
          600: '#3d7adb',
          700: '#2a5ab3',
          800: '#1b3a8a',
          900: '#112a61',
        },
        mint: {
          50: '#f0fdf9',
          500: '#10b981',
          600: '#059669',
        },
        sky: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          600: '#0284c7',
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
}
