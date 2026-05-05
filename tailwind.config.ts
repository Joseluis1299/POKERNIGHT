import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0d111d',
        accent: '#10b981',
        danger: '#f43f5e'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(16, 185, 129, 0.2), 0 18px 42px rgba(15, 23, 42, 0.45)'
      },
      keyframes: {
        'balance-flash': {
          '0%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.6)' },
          '100%': { boxShadow: '0 0 0 14px rgba(16, 185, 129, 0)' }
        }
      },
      animation: {
        'balance-flash': 'balance-flash 700ms ease-out'
      }
    }
  },
  plugins: []
} satisfies Config;
