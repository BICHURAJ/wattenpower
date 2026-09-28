/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        // Watten Power logo blue (#006AFD) -- the primary theme colour.
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd6ff',
          300: '#8ebcff',
          400: '#4d93fe',
          500: '#006afd',
          600: '#0058d8',
          700: '#0047ae',
          800: '#063c8c',
          900: '#0b3372',
        },
        // Watten Power logo green (#80DD37) -- used sparingly as an accent.
        accent: {
          50: '#f3fce9',
          100: '#e4f8d0',
          200: '#caf1a4',
          300: '#a9e76f',
          400: '#93e24f',
          500: '#80dd37',
          600: '#63bb1f',
          700: '#4b9018',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 35, 75, 0.04), 0 4px 16px -4px rgba(15, 35, 75, 0.07)',
        panel: '0 30px 80px -20px rgba(0, 70, 174, 0.25)',
      },
    },
  },
  plugins: [],
}
