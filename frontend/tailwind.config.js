/** @type {import('tailwindcss').Config} */
export default {
  content: ["./frontend/index.html", "./frontend/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      colors: {
        ink: "#10131a",
        panel: "#171b24",
        panel2: "#202633",
        mint: "#67e8b9",
        ember: "#f59e5b",
        sky: "#7dd3fc",
      },
    },
  },
  plugins: [],
};

