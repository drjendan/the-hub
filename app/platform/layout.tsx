import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Gate for the ENTIRE platform-owner portal. requireSuperAdmin() redirects any
 * non-super-admin to the dashboard before a single child page renders, so every
 * route under /platform — including future sub-pages — is protected here, in one
 * place, and cannot forget the check. This is the only section of the app that
 * reads across tenants; it does so exclusively via the service-role client in
 * the child pages, always after this gate has run.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="mb-6 rounded-xl border-l-2 border-terracotta bg-terracotta/[0.06] px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-terracotta-deep font-semibold">
          Platform owner · cross-tenant
        </div>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          You are viewing data across <strong className="text-ink">every</strong> company. This view
          bypasses tenant isolation and is restricted to platform super-admins.
        </p>
      </div>
      {children}
    </div>
  );
}
