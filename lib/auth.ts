import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/supabase/types";

export const ORG_COOKIE = "org_id";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  app_role: AppRole;
  default_org_id: string | null;
}

export interface OrgRef {
  id: string;
  name: string;
  org_role: string;
  logo_url: string | null;
}

/** Emails listed in ADMIN_EMAILS are auto-promoted to the global admin role. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** The signed-in auth user, or null. */
export async function getUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Make sure the profile exists and reflects the right role. The DB trigger
 * already inserts a profile on sign-up; here we (a) promote ADMIN_EMAILS to
 * admin, (b) default a brand-new builder's role, and (c) set default_org_id
 * once the user belongs to an org. Uses the service role because the
 * self-escalation guard blocks role changes from the user's own session.
 */
export async function ensureProfile(user: User): Promise<Profile> {
  const admin = createAdminClient();
  const wantAdmin = isAdminEmail(user.email);

  // Load (or lazily create) the profile.
  let { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, app_role, default_org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Normally the on-signup DB trigger already created the row; upsert here is
    // a race-safe fallback (and works if the trigger wasn't installed).
    const { data: created } = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name:
            (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split("@")[0] ||
            null,
          app_role: wantAdmin ? "admin" : "member",
        },
        { onConflict: "id" }
      )
      .select("id, email, full_name, app_role, default_org_id")
      .single();
    if (created) profile = created;
  }

  if (!profile) {
    const { data } = await admin
      .from("profiles")
      .select("id, email, full_name, app_role, default_org_id")
      .eq("id", user.id)
      .single();
    profile = data!;
  }

  const patch: Record<string, unknown> = {};
  const desiredRole: AppRole = wantAdmin ? "admin" : profile.app_role;
  if (desiredRole !== profile.app_role) patch.app_role = desiredRole;

  // Fill default_org_id from the first membership if unset.
  if (!profile.default_org_id) {
    const { data: firstMembership } = await admin
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstMembership) patch.default_org_id = firstMembership.organization_id;
  }

  if (Object.keys(patch).length > 0) {
    const { data: updated } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("id, email, full_name, app_role, default_org_id")
      .single();
    if (updated) profile = updated;
  }

  return profile as Profile;
}

/** Organizations the signed-in user belongs to (RLS-scoped). */
export async function getOrgsForUser(): Promise<OrgRef[]> {
  const supabase = createClient();
  // Try selecting logo_url; fall back if the logos migration hasn't been run yet,
  // so the whole app (which loads this in the layout) keeps working regardless.
  let res = (await supabase
    .from("org_members")
    .select("org_role, organization:organizations(id, name, logo_url)")
    .order("created_at", { ascending: true })) as { data: unknown; error: unknown };
  if (res.error) {
    res = (await supabase
      .from("org_members")
      .select("org_role, organization:organizations(id, name)")
      .order("created_at", { ascending: true })) as { data: unknown; error: unknown };
  }

  const rows = (res.data as Record<string, unknown>[] | null) || [];
  return rows
    .map((row) => {
      const org = row.organization as { id: string; name: string; logo_url?: string | null } | null;
      return org
        ? { id: org.id, name: org.name, org_role: row.org_role as string, logo_url: org.logo_url ?? null }
        : null;
    })
    .filter((o): o is OrgRef => o !== null);
}

/**
 * Resolve the "active" organization: a valid org cookie, else the profile
 * default, else the first membership. Returns null if the user has no orgs yet.
 */
export async function getCurrentOrgId(
  orgs?: OrgRef[],
  profile?: Profile
): Promise<string | null> {
  const list = orgs ?? (await getOrgsForUser());
  if (list.length === 0) return null;
  const ids = new Set(list.map((o) => o.id));

  const cookieOrg = cookies().get(ORG_COOKIE)?.value;
  if (cookieOrg && ids.has(cookieOrg)) return cookieOrg;

  const def = profile?.default_org_id;
  if (def && ids.has(def)) return def;

  return list[0].id;
}

/** Redirect to /login if not signed in; otherwise return the user. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an admin (provider) — redirects non-admins to the dashboard. */
export async function requireAdmin(): Promise<{ user: User; profile: Profile }> {
  const user = await requireUser();
  const profile = await ensureProfile(user);
  if (profile.app_role !== "admin") redirect("/");
  return { user, profile };
}

/**
 * Non-redirecting admin check for API route handlers. Returns the admin's
 * user+profile, or null if the caller is not a signed-in admin.
 */
export async function currentAdmin(): Promise<{ user: User; profile: Profile } | null> {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  if (profile.app_role !== "admin") return null;
  return { user, profile };
}

/**
 * Non-redirecting owner check for API route handlers. The "owner" is the tenant
 * admin (org_role = 'owner') of the caller's *active* organization — the role
 * allowed to manage that company's BYO provider keys. Returns the user + the
 * active org id, or null if the caller is not a signed-in owner of an org.
 */
export async function currentOrgOwner(): Promise<{ user: User; orgId: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);
  if (!orgId) return null;
  const isOwner = orgs.some((o) => o.id === orgId && o.org_role === "owner");
  return isOwner ? { user, orgId } : null;
}

/** Require an org owner — redirects non-owners to the dashboard. */
export async function requireOrgOwner(): Promise<{ user: User; orgId: string }> {
  const owner = await currentOrgOwner();
  if (!owner) redirect("/");
  return owner;
}

/**
 * Non-redirecting "company admin" check: a global admin OR the owner of the
 * caller's active organization. Used to gate per-company governance-knowledge
 * management. Returns the user + active org id, or null.
 */
export async function currentOrgAdmin(): Promise<{ user: User; orgId: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);
  if (!orgId) return null;
  const isAdmin = profile.app_role === "admin";
  const isOwner = orgs.some((o) => o.id === orgId && o.org_role === "owner");
  return isAdmin || isOwner ? { user, orgId } : null;
}
