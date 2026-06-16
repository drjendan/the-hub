import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
});
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
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
      const orgs = await getOrgsForUser();
      const currentOrgId = await getCurrentOrgId(orgs, profile);
      shell = (
        <Sidebar
          user={{ email: user.email ?? "", fullName: profile.full_name }}
          role={profile.app_role}
          orgs={orgs}
          currentOrgId={currentOrgId}
          isAdmin={profile.app_role === "admin"}
        />
      );
    }
  } catch {
    shell = null;
  }

  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <div className="relative z-10 flex min-h-screen">
          {shell}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
