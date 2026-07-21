import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // FoxSystems Medical brand — DNA pulled from the Fox Systems logo:
        // electric cyan circuitry over deep navy (azure mid-tone).
        brand: {
          50:  "#eef6ff",
          100: "#d9ecff",
          200: "#b6dbff",
          300: "#82c2ff",
          400: "#3aa0f7",
          500: "#2b87f2",   // primary azure
          600: "#1570d6",
          700: "#155cb0",
          800: "#164a8a",
          900: "#0a1e3f"    // logo navy
        },
        // Direct logo tokens for accents/backgrounds.
        fox: {
          cyan: "#00e5ff",
          navy: "#0a1e3f",
          azure: "#2b87f2"
        },
        accent: {
          500: "#00e5ff",   // electric cyan highlights, CTAs
          600: "#06b6d4"
        }
      },
      fontFamily: {
        sans: ["Cairo", "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
