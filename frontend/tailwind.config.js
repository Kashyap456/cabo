/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wood: {
          light: '#D2B48C',  // Tan wood
          medium: '#A0522D', // Sienna
          dark: '#8B4513',   // Saddle brown
          darker: '#654321', // Dark brown
        },
        gold: {
          light: '#FFE4B5',  // Moccasin
          medium: '#FFD700', // Gold
          dark: '#DAA520',   // Goldenrod
          border: '#B8860B', // Dark goldenrod
        },
        amber: {
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        }
      },
      backgroundImage: {
        'wood-grain': 'linear-gradient(180deg, #8B4513 0%, #A0522D 50%, #8B4513 100%)',
        'wood-light': 'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
        'wood-button': 'linear-gradient(180deg, #B45309 0%, #92400E 50%, #78350F 100%)',
      },
      boxShadow: {
        'wood-raised': 'inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 8px rgba(0,0,0,0.3)',
        'wood-inset': 'inset 0 2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'wood-deep': 'inset 0 2px 4px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.5)',
        'gold-glow': '0 0 8px rgba(255,215,0,0.3)',
        'button-hover': 'inset 0 2px 6px rgba(0,0,0,0.4), 0 6px 12px rgba(0,0,0,0.6)',
      },
      textShadow: {
        'painted': '1px 1px 0 rgba(92,51,23,0.8), 2px 2px 2px rgba(0,0,0,0.5)',
        'painted-glow': '1px 1px 0 rgba(92,51,23,0.8), 2px 2px 2px rgba(0,0,0,0.5), 0 0 8px rgba(255,223,0,0.3)',
        'dark': '1px 1px 2px rgba(0,0,0,0.5)',
      },
      borderWidth: {
        '3': '3px',
      },
      fontWeight: {
        'black': '900',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.text-shadow-painted': {
          textShadow: '1px 1px 0 rgba(92,51,23,0.8), 2px 2px 2px rgba(0,0,0,0.5)',
        },
        '.text-shadow-painted-glow': {
          textShadow: '1px 1px 0 rgba(92,51,23,0.8), 2px 2px 2px rgba(0,0,0,0.5), 0 0 8px rgba(255,223,0,0.3)',
        },
        '.text-shadow-dark': {
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
        },
        '.wood-texture': {
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.2 0 0 0 0 0 0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'multiply',
        },
      })
    },
  ],
}