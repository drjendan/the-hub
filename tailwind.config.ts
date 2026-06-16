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
          DEFAULT: "#141a27",   // cool navy (headings, dark surfaces)
          soft: "#1e2638",
          line: "#2b3446",
        },
        paper: "#f8fafc",       // cool near-white
        accent: {
          DEFAULT: "#2b53d1",   // royal blue — matches the PrimeTDAP brand
          soft: "#7591e6",
          deep: "#1e3fa8",
        },
        moss: "#1d7d5f",        // approved / healthy (cool emerald)
        rust: "#c43d3d",        // blocked / risk (clean red)
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
