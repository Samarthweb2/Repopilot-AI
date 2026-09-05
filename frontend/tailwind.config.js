/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#031728",
        foreground: "#f8fafc",
        nebius: {
          lime: "#D2FE22",
          "lime-dark": "#B5DD00",
          "lime-light": "#E8FF68",
          "lime-pale": "#F6FFE0",
          navy: "#031728",
          "navy-card": "#051f36",
          "navy-hover": "#082c4d",
          blue: "#5D52F6",
          gray: "#F4F5F7",
          border: "#e2e8f0",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#031728",
          dark: "#051f36",
          muted: "#f1f5f9",
        },
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#031728",
        },
        primary: {
          DEFAULT: "#031728",
          hover: "#082c4d",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#f1f5f9",
          hover: "#e2e8f0",
          foreground: "#031728",
        },
        accent: {
          DEFAULT: "#D2FE22",
          hover: "#B5DD00",
          foreground: "#000000",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
        success: {
          DEFAULT: "#10b981",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#ffffff",
        },
        border: "#e2e8f0",
        input: "#e2e8f0",
        ring: "#D2FE22",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
        full: "9999px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        nebius: ['"Space Mono"', "ui-monospace", "monospace"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },

    },
  },
  plugins: [],
}
