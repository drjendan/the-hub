import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId, isPlatformSuperAdmin, getAccountsForAdmin } from "@/lib/auth";

// Inter is the single typeface across the app (matches the design reference).
// cv11/ss01 feature settings + antialiasing are applied globally in globals.css.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Hub — Enterprise AI Agent Hub",
  description: "Discover, govern, and deploy AI agents across the enterprise.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the signed-in user + their workspace for the shell. Guarded so the
  // login page still renders if Supabase env is not configured yet.
  let shell: React.ReactNode = null;
  try {
    const user = await getUser();
    if (user) {
      const profile = await ensureProfile(user);
      const orgs = await getOrgsForUser(user.id);
      const currentOrgId = await getCurrentOrgId(orgs, profile);
      const accounts = await getAccountsForAdmin(user.id);
      shell = (
        <Sidebar
          user={{ email: user.email ?? "", fullName: profile.full_name }}
          role={profile.app_role}
          orgs={orgs}
          currentOrgId={currentOrgId}
          isAdmin={profile.app_role === "admin"}
          isSuperAdmin={isPlatformSuperAdmin(user.email)}
          isAccountAdmin={accounts.length > 0}
        />
      );
    }
  } catch {
    shell = null;
  }

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="relative z-10 flex min-h-screen">
          {shell}
          <main className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-w-0">{children}</div>
            <Footer />
          </main>
        </div>
      </body>
    </html>
  );
}
