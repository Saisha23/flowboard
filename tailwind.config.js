/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand palette — Midnight Atelier
        midnight: {
          DEFAULT: '#111820',
          50: '#E8EAEC',
          100: '#C8CDD3',
          200: '#9BA3AD',
          300: '#6E7886',
          400: '#4A5460',
          500: '#2E3640',
          600: '#1F2731',
          700: '#161D26',
          800: '#111820',
          900: '#0B1015',
        },
        porcelain: {
          DEFAULT: '#F5F2EA',
          50: '#FBFAF6',
          100: '#F5F2EA',
          200: '#EDE9DE',
          300: '#E2DDCD',
        },
        mint: {
          DEFAULT: '#B8E4D0',
          50: '#F1F9F5',
          100: '#DCEFE4',
          200: '#B8E4D0',
          300: '#92D3B4',
          400: '#6BC29A',
          500: '#4AAB80',
        },
        apricot: {
          DEFAULT: '#D69A78',
          50: '#FBF1EA',
          100: '#F2DAC8',
          200: '#D69A78',
          300: '#C17F5C',
          400: '#A66543',
        },
        slatey: {
          DEFAULT: '#777C8E',
          50: '#F3F4F7',
          100: '#E2E4EB',
          200: '#C5C9D4',
          300: '#A2A7B6',
          400: '#777C8E',
          500: '#5C6173',
          600: '#454A5B',
        },
        sand: {
          DEFAULT: '#E8D8B8',
          50: '#FBF7EC',
          100: '#F2E9D5',
          200: '#E8D8B8',
          300: '#D8C498',
        },
        // Risk
        coral: '#D97770',
        amber: '#E2B65C',
        sage: '#77B99B',
        ivory: '#FBFAF6',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        editorial: ['"DM Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'display-xl': ['4.5rem', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'display-md': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      letterSpacing: {
        tightish: '-0.015em',
        editorial: '-0.01em',
        wide2: '0.08em',
        widest2: '0.18em',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(17,24,32,0.04), 0 1px 3px rgba(17,24,32,0.03)',
        card: '0 1px 2px rgba(17,24,32,0.05), 0 4px 12px rgba(17,24,32,0.04)',
        lift: '0 2px 4px rgba(17,24,32,0.06), 0 12px 28px rgba(17,24,32,0.08)',
        glow: '0 0 0 1px rgba(184,228,208,0.5), 0 8px 24px rgba(184,228,208,0.25)',
        ring: '0 0 0 4px rgba(184,228,208,0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'draw-line': {
          '0%': { strokeDashoffset: '400' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
        float: 'float 6s ease-in-out infinite',
        'draw-line': 'draw-line 2s ease-out forwards',
      },
      backgroundImage: {
        'porcelain-grain': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
        'midnight-grain': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
