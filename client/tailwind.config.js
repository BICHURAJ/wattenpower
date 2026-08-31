/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          500: '#1a8fe3',
          600: '#0d7ac9',
          700: '#0b64a4',
        },
      },
    },
  },
  plugins: [],
}
