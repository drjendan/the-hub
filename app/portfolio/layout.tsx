import { requireAccountAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Gate for the entire account-admin portfolio. requireAccountAdmin() redirects
 * anyone who administers no account before a child renders. Every cross-workspace
 * read in the child pages uses the service-role client pinned to an account the
 * caller administers — RLS is the guardrail, this gate + pinning is the aggregator.
 */
export default async function PortfolioLayout({ children }: { children: React.ReactNode }) {
  await requireAccountAdmin();

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="mb-6 rounded-xl border-l-2 border-accent bg-accent/[0.05] px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-accent font-semibold">
          Account portfolio · rollup
        </div>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          You are viewing every workspace in your account. Team members see only the workspaces
          they&apos;re assigned to.
        </p>
      </div>
      {children}
    </div>
  );
}
