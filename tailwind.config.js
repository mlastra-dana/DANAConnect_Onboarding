/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#004E9B',
        primaryHover: '#003D7A',
        dark: '#1A3A53',
        grayText: '#526572',
        surface: '#F5F7F9',
        borderLight: '#DCE4EA',
        successSoft: '#EDF8F1',
        errorSoft: '#FEF3F2',
        pendingSoft: '#F4F6FA',
        brand: {
          50: '#EDF5FC',
          100: '#DCECF8',
          300: '#96B5D1',
          500: '#004E9B',
          600: '#003D7A',
          700: '#00346B',
          900: '#1A3A53'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04)',
        'soft-dark': '0 6px 16px rgba(16, 24, 40, 0.08)',
        'soft-orange': '0 8px 20px rgba(0, 78, 155, 0.16)'
      },
      fontFamily: {
        sans: ['Roboto', 'Arial', 'sans-serif']
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        }
      },
      animation: {
        marquee: 'marquee 24s linear infinite',
        fadeUp: 'fadeUp 0.5s ease-out'
      }
    }
  },
  plugins: []
};
