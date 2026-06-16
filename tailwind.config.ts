import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0e1116",
          soft: "#171b22",
          line: "#252b35",
        },
        paper: "#f6f5f1",
        accent: {
          DEFAULT: "#c9763d",   // warm amber/copper — institutional, not "AI purple"
          soft: "#e7a072",
          deep: "#9b5526",
        },
        moss: "#3f6f5b",        // approved / healthy
        rust: "#a8442f",        // blocked / risk
        gold: "#b58a2e",        // pending / review
      },
      fontFamily: {
        // Single typeface (Inter) — the design reference uses no serif and no
        // separate monospace face. font-display/font-mono kept as aliases so
        // existing class usages resolve to Inter rather than breaking.
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,17,22,0.04), 0 8px 24px -12px rgba(14,17,22,0.12)",
        lift: "0 12px 40px -16px rgba(14,17,22,0.30)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
