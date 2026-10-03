/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
    "./node_modules/@zardui/components/**/*.{html,ts,js}" // Mapeia os componentes do Zard
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
