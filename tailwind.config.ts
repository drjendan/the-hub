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
          DEFAULT: "#15232c",   // primary text + dark surfaces (sidebar/buttons)
          soft: "#5a6b73",      // muted/secondary text
          line: "#22343f",      // "soft ink" navy — dark-button hover
        },
        paper: "#ffffff",       // surfaces / cards
        accent: {
          DEFAULT: "#11b2ee",   // PRIMARY — logo cyan (the orange/copper is retired)
          soft: "#6fd0f5",      // lighter cyan (e.g. icon on dark active nav)
          deep: "#0c90c4",      // darker cyan (hover / readable cyan)
        },
        terracotta: {
          DEFAULT: "#e07856",   // SECONDARY pop — use sparingly (fills)
          deep: "#b5512f",      // readable terracotta for small text
        },
        moss: "#1d7a4f",        // success / approved / published / live (readable green)
        rust: "#b3261e",        // error / blocked / risk (red)
        gold: "#b8801c",        // pending / in-review (amber)
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
