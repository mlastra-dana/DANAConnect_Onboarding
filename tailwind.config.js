/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        perfilabOrange: '#F28C28',
        perfilabOrangeDark: '#E57B12',
        perfilabDark: '#2F2F2F',
        perfilabGray: '#5B5B5B',
        perfilabGreen: '#25D366',
        brand: {
          50: '#fff6ec',
          100: '#fde8cf',
          500: '#F28C28',
          600: '#de7e22',
          700: '#c56c18',
          900: '#7a3f0d'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(242, 140, 40, 0.16)',
        'soft-dark': '0 12px 30px rgba(0, 0, 0, 0.10)',
        'soft-orange': '0 10px 24px rgba(242, 140, 40, 0.30)'
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Segoe UI', 'sans-serif']
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
