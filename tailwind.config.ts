
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a', // Deep slate
        surface: '#1e293b',    // Card background
        primary: '#3b82f6',    // Bright blue accent
        'primary-hover': '#2563eb',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        serif: ['var(--font-playfair)', 'serif'], // For book text
      },
      animation: {
        'flip-left': 'flipLeft 0.6s ease-in-out forwards',
      },
      keyframes: {
        flipLeft: {
          '0%': { transform: 'rotateY(0deg)', opacity: '1' },
          '100%': { transform: 'rotateY(-180deg)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
