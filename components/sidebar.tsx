"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/supabase/types";

const NAV = [
  { href: "/", label: "Dashboard", glyph: "◈" },
  { href: "/hub", label: "Library", glyph: "⬡" },
  { href: "/apps", label: "Apps", glyph: "▦" },
  { href: "/intake/role", label: "Role Match", glyph: "⊹" },
  { href: "/builder", label: "Builder", glyph: "✎" },
  { href: "/sessions", label: "Sessions", glyph: "❖" },
  { href: "/knowledge", label: "Governance", glyph: "⚖" },
  { href: "/governance", label: "Approvals", glyph: "§" },
  { href: "/analytics", label: "Analytics", glyph: "▤" },
];

const SECONDARY = [{ href: "/intake/corporate", label: "Corporate Intake" }];

interface OrgRef {
  id: string;
  name: string;
  org_role: string;
  logo_url: string | null;
}

export function Sidebar({
  user,
  role,
  orgs,
  currentOrgId,
  isAdmin,
}: {
  user: { email: string; fullName: string | null };
  role: AppRole;
  orgs: OrgRef[];
  currentOrgId: string | null;
  isAdmin: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const currentOrg = orgs.find((o) => o.id === currentOrgId) || null;

  async function switchOrg(orgId: string) {
    await fetch("/api/org/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId }),
    });
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex w-[248px] shrink-0 flex-col border-r hairline bg-[#f6f1e9]/80 backdrop-blur sticky top-0 h-screen">
      <div className="px-5 pt-6 pb-5 border-b hairline">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- product brand logo */}
          <img src="/the-hub-logo.png" alt="The Hub" className="h-9 w-9 shrink-0 rounded-xl object-contain" />
          <div className="leading-tight flex-1 min-w-0">
            <div className="display text-[20px] font-bold leading-none">The Hub</div>
            <div className="mt-1 whitespace-nowrap text-[8px] uppercase tracking-[0.06em] text-ink-soft/70">
              Apps · Agents · Governance
            </div>
          </div>
          {currentOrg?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded company logo
            <img
              src={currentOrg.logo_url}
              alt={currentOrg.name}
              className="h-9 w-9 shrink-0 rounded-lg border hairline bg-white object-contain"
            />
          )}
        </div>
      </div>

      {/* Workspace / org switcher */}
      <div className="px-4 pt-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft/70 mb-1.5">Workspace</div>
        {orgs.length > 0 ? (
          <select
            value={currentOrgId ?? ""}
            onChange={(e) => switchOrg(e.target.value)}
            className="w-full rounded-lg border hairline bg-white px-2.5 py-2 text-[13px] outline-none focus:border-accent"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-lg border hairline bg-white px-2.5 py-2 text-[12px] text-ink-soft">
            No company yet
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors ${
              active(n.href) ? "bg-ink text-paper" : "text-ink-soft hover:bg-black/[0.04] hover:text-ink"
            }`}
          >
            <span className={`w-4 text-center ${active(n.href) ? "text-accent-soft" : "text-accent"}`}>
              {n.glyph}
            </span>
            {n.label}
          </Link>
        ))}

        <div className="px-3 pt-5 pb-1 text-[10px] uppercase tracking-[0.14em] text-ink-soft/70">Setup</div>
        {SECONDARY.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              active(n.href) ? "text-ink font-medium" : "text-ink-soft hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        ))}
        {currentOrg?.org_role === "owner" && (
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              active("/settings") ? "text-ink font-medium" : "text-ink-soft hover:text-ink"
            }`}
          >
            AI Provider Keys
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
              active("/admin") ? "text-ink font-medium" : "text-ink-soft hover:text-ink"
            }`}
          >
            Companies &amp; Users
          </Link>
        )}
      </nav>

      <div className="border-t hairline p-3 space-y-2">
        <div className="rounded-xl bg-white border hairline p-3">
          <div className="text-[12px] font-semibold leading-tight truncate">
            {user.fullName || user.email}
          </div>
          <div className="text-[11px] text-ink-soft truncate">{user.email}</div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-moss" />
            <span className="text-[11px] text-ink-soft capitalize">
              {role}
              {currentOrg ? ` · ${currentOrg.org_role}` : ""}
            </span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full rounded-lg border hairline bg-white py-2 text-[12px] font-medium text-ink-soft hover:text-ink hover:border-ink-soft transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
