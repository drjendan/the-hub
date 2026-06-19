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

export interface AccountRef {
  id: string;
  name: string;
  account_role: string;
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

/**
 * Is this email a PLATFORM SUPER-ADMIN — the platform owner who can see and
 * manage every tenant across the whole system?
 *
 * This is a DELIBERATELY SEPARATE designation from app_role='admin' (the
 * per-provider company admin) and from org_role='owner' (a single tenant's
 * admin). Neither of those grants platform-wide access. Super-admin is granted
 * ONLY by listing the email in the PLATFORM_SUPERADMIN_EMAILS environment
 * variable — it lives in the deployment env, never in the database, so no
 * in-app write path (profile update, self-escalation bug, rogue company admin)
 * can ever mint one. Changing the set requires host-level env access.
 */
export function isPlatformSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_SUPERADMIN_EMAILS || "")
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

/**
 * Workspaces the signed-in user can open in the main app — the union of:
 *   1. direct workspace memberships (their own org_members rows), and
 *   2. account-admin ROLLUP: every workspace under an account they administer.
 *
 * Uses the service role with explicit user_id / account scoping (rather than
 * leaning on org_members RLS, which returns teammates' rows too). An account
 * admin is treated as 'owner' of their account's workspaces, which overrides a
 * lower direct role on the same workspace.
 */
export async function getOrgsForUser(userId?: string): Promise<OrgRef[]> {
  const uid = userId ?? (await getUser())?.id;
  if (!uid) return [];
  const admin = createAdminClient();

  // 1) Direct memberships (this user's own rows). logo_url may not exist yet
  //    (logos.sql) — fall back without it so the layout never crashes.
  let mem = (await admin
    .from("org_members")
    .select("org_role, organization:organizations(id, name, logo_url)")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })) as { data: Record<string, unknown>[] | null; error: unknown };
  if (mem.error) {
    mem = (await admin
      .from("org_members")
      .select("org_role, organization:organizations(id, name)")
      .eq("user_id", uid)
      .order("created_at", { ascending: true })) as { data: Record<string, unknown>[] | null; error: unknown };
  }

  // 2) Account-admin rollup: workspaces under every account the user administers.
  const { data: acctRows } = await admin
    .from("account_members")
    .select("account_id")
    .eq("user_id", uid);
  const accountIds = ((acctRows as { account_id: string }[] | null) || []).map((r) => r.account_id);

  let rollup: Record<string, unknown>[] = [];
  if (accountIds.length > 0) {
    let r = (await admin
      .from("organizations")
      .select("id, name, logo_url, account_id")
      .in("account_id", accountIds)
      .order("created_at", { ascending: true })) as { data: Record<string, unknown>[] | null; error: unknown };
    if (r.error) {
      r = (await admin
        .from("organizations")
        .select("id, name, account_id")
        .in("account_id", accountIds)
        .order("created_at", { ascending: true })) as { data: Record<string, unknown>[] | null; error: unknown };
    }
    rollup = r.data || [];
  }

  const map = new Map<string, OrgRef>();
  for (const row of mem.data || []) {
    const org = row.organization as { id: string; name: string; logo_url?: string | null } | null;
    if (org) map.set(org.id, { id: org.id, name: org.name, org_role: row.org_role as string, logo_url: org.logo_url ?? null });
  }
  for (const org of rollup) {
    map.set(org.id as string, {
      id: org.id as string,
      name: org.name as string,
      org_role: "owner",
      logo_url: (org.logo_url as string | null) ?? null,
    });
  }
  return [...map.values()];
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

/**
 * Non-redirecting platform super-admin check for API route handlers. Returns
 * the super-admin's user, or null if the caller is not a signed-in super-admin.
 *
 * This is the ONLY gate protecting cross-tenant data: callers MUST invoke this
 * (and bail on null) BEFORE constructing the RLS-bypassing service-role client.
 */
export async function currentSuperAdmin(): Promise<{ user: User } | null> {
  const user = await getUser();
  if (!user) return null;
  return isPlatformSuperAdmin(user.email) ? { user } : null;
}

/**
 * Require a platform super-admin — redirects everyone else to the dashboard
 * (no hint the platform portal exists). Use this in the /platform layout so the
 * entire cross-tenant section is gated in one place. Returns the user.
 */
export async function requireSuperAdmin(): Promise<{ user: User }> {
  const user = await requireUser();
  if (!isPlatformSuperAdmin(user.email)) redirect("/");
  return { user };
}

/**
 * Accounts the signed-in user administers (the rollup principal). Read via the
 * service role so the check never depends on the very RLS it gates — and so it
 * works before any workspace/membership context is resolved.
 */
export async function getAccountsForAdmin(userId: string): Promise<AccountRef[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_members")
    .select("account_role, account:accounts(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const rows = (data as Record<string, unknown>[] | null) || [];
  return rows
    .map((row) => {
      const acct = row.account as { id: string; name: string } | null;
      return acct ? { id: acct.id, name: acct.name, account_role: row.account_role as string } : null;
    })
    .filter((a): a is AccountRef => a !== null);
}

/** True if the user administers this specific account. */
export async function isAccountAdmin(userId: string, accountId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_members")
    .select("id")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .maybeSingle();
  return !!data;
}

/**
 * True if the user administers the account that owns this workspace. The pinning
 * predicate for portfolio endpoints: an account admin may act on a workspace ONLY
 * when that workspace's account_id is one they administer (never another account).
 */
export async function adminAccountForWorkspace(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("account_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const accountId = (org?.account_id as string | null) ?? null;
  if (!accountId) return null;
  return (await isAccountAdmin(userId, accountId)) ? accountId : null;
}

/**
 * Non-redirecting account-admin check for API routes. Returns the user plus the
 * accounts they administer, or null if they administer none.
 */
export async function currentAccountAdmin(): Promise<{ user: User; accounts: AccountRef[] } | null> {
  const user = await getUser();
  if (!user) return null;
  const accounts = await getAccountsForAdmin(user.id);
  return accounts.length > 0 ? { user, accounts } : null;
}

/**
 * Require an account admin — redirects users who administer no account to the
 * dashboard. Gates the entire /portfolio section in its layout.
 */
export async function requireAccountAdmin(): Promise<{ user: User; accounts: AccountRef[] }> {
  const user = await requireUser();
  const accounts = await getAccountsForAdmin(user.id);
  if (accounts.length === 0) redirect("/");
  return { user, accounts };
}
