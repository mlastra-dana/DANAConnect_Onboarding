/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4B16B6',
        primaryHover: '#3A118E',
        dark: '#0F0F1F',
        grayText: '#3B4255',
        surface: '#F7F6FB',
        borderLight: '#E5E0F7',
        successSoft: '#F5F0FF',
        errorSoft: '#FEF3F2',
        pendingSoft: '#F4F6FA',
        brand: {
          50: '#F5F0FF',
          100: '#E7DCFF',
          300: '#BEA6FF',
          500: '#4B16B6',
          600: '#3A118E',
          700: '#2B0D6B',
          900: '#0F0F1F'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04)',
        'soft-dark': '0 6px 16px rgba(16, 24, 40, 0.08)',
        'soft-orange': '0 8px 20px rgba(75, 22, 182, 0.22)'
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
