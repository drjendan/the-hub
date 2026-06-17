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
          DEFAULT: "#211c18",   // warm charcoal (headings, dark surfaces)
          soft: "#322a23",
          line: "#3e352d",
        },
        paper: "#faf7f2",       // warm ivory
        accent: {
          DEFAULT: "#b25a3f",   // muted terracotta — warm but professional
          soft: "#d39a85",
          deep: "#8f4530",
        },
        moss: "#3f7d5e",        // approved / healthy (warm-leaning green)
        rust: "#bb4533",        // blocked / risk (warm red)
        gold: "#b8801c",        // pending / review (amber)
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
