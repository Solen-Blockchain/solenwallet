/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        solen: {
          orange: "#F5920F",
          "orange-light": "#FF9E33",
          green: "#10b981",
          amber: "#f59e0b",
          indigo: "#6366f1",
        },
      },
    },
  },
  plugins: [],
};
