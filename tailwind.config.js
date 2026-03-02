/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#DD5736',
        primaryHover: '#C5482A',
        dark: '#1F1F1F',
        grayText: '#6B6B6B',
        surface: '#F5F5F5',
        borderLight: '#EAEAEA',
        successSoft: '#FFF4F1',
        errorSoft: '#FEF3F2',
        pendingSoft: '#F3F4F6',
        brand: {
          50: '#FFF4F1',
          100: '#FDE4DD',
          500: '#DD5736',
          600: '#C5482A',
          700: '#A63D24',
          900: '#5A261B'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04)',
        'soft-dark': '0 6px 16px rgba(16, 24, 40, 0.08)',
        'soft-orange': '0 8px 20px rgba(221, 87, 54, 0.22)'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif']
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
