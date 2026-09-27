/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Alignée sur l'icône de l'application (mêmes verts que le fond de l'icône)
        primary: {
          50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',
          500:'#12A17A',600:'#0F9D74',700:'#086B4E',800:'#0B5C42',900:'#08422F',950:'#04241A',
        },
        brand: {
          emerald: '#0F9D74',
          'emerald-light': '#12A17A',
          'emerald-dark': '#086B4E',
          'emerald-deep': '#0B5C42',
          gold: '#FDAF08',
          'gold-light': '#F4CF53',
          amber: '#F28D0C',
          'amber-dark': '#ED6A11',
          brown: '#451008',
          cream: '#F3E7C9',
        },
      },
    },
  },
  plugins: [],
};