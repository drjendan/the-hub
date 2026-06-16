/**
 * "Powered by Nexx Jenn Tech" footer — replicated from the design reference
 * (the-hub.jsx): centered, on a thin top divider, muted tone, ~18px logo.
 * Rendered once in the root layout so it appears on every page.
 */
export function Footer() {
  return (
    <footer className="flex shrink-0 items-center justify-center gap-2 border-t hairline px-6 py-3">
      <span className="text-[11px] text-ink-soft/60">Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo, fixed height */}
      <img
        src="/nexx-jenn-tech-logo.png"
        alt="Nexx Jenn Tech"
        className="h-[18px] w-auto opacity-80"
      />
      <span className="text-[11px] font-medium text-ink-soft/80">Nexx Jenn Tech</span>
    </footer>
  );
}
