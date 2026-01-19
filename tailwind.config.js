/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        grow: {
          neon: '#00FF88',
          dark: '#000000',
          surface: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
          muted: '#9CA3AF',
        },
      },
      backgroundImage: {
        'grow-gradient': 'radial-gradient(circle at center, #065F46 0%, #000000 100%)',
        'grow-neon-gradient': 'linear-gradient(135deg, #00FF88 0%, #00BD65 100%)',
      },
      boxShadow: {
        'neon': '0 0 20px rgba(0, 255, 136, 0.3)',
        'neon-hover': '0 0 30px rgba(0, 255, 136, 0.5)',
      }
    },
  },
  plugins: [],
}
