import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f6",
          100: "#d5ecea",
          200: "#acd9d5",
          300: "#7bbfba",
          400: "#4ea29d",
          500: "#348783",
          600: "#276c6a",
          700: "#225756",
          800: "#1f4746",
          900: "#1d3c3b",
          950: "#0c2222",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
