/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Slate-navy scale — readable blues instead of near-black
        dark: {
          50:  '#f2f7fc', 100: '#e2edf7', 200: '#c8dcec',
          300: '#a6c1db', 400: '#80a5c8', 500: '#5a86ae',
          600: '#3d6a91', 700: '#2b506f', 750: '#1f3d5a',
          800: '#162d46', 850: '#0f2035', 900: '#0a1828',
          925: '#07121f', 950: '#040d17',
        },
        brand: {
          DEFAULT: '#6366f1', 50: '#eef2ff', 100: '#e0e7ff',
          300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1',
          600: '#4f46e5', 700: '#4338ca', 900: '#312e81',
        },
        live:    '#22c55e',
        timeout: '#f59e0b',
        danger:  '#ef4444',
        info:    '#38bdf8',
      },
      backgroundImage: {
        'gradient-radial':  'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':   'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'card-glass': 'linear-gradient(135deg, rgba(13,28,46,0.95) 0%, rgba(6,14,26,0.98) 100%)',
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(99,102,241,0.35), 0 0 60px rgba(99,102,241,0.1)',
        'glow-green': '0 0 20px rgba(34,197,94,0.35), 0 0 60px rgba(34,197,94,0.1)',
        'glow-red':   '0 0 20px rgba(239,68,68,0.35), 0 0 60px rgba(239,68,68,0.1)',
        'card':       '0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)',
        'card-hi':    '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.12)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'score-pop': 'scorePop 0.5s cubic-bezier(0.175,0.885,0.32,1.275)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      backdropBlur: { xs: '2px' },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        score:   ['Impact', 'Arial Narrow', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
