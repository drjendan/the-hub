/**
 * Google OAuth + Gmail REST helpers (no SDK; plain fetch).
 *
 * Flow: buildConsentUrl → user authorizes → callback gets a code →
 * exchangeCode → store tokens. Later, refreshAccessToken keeps access alive,
 * and the Gmail helpers read the inbox. Scope is read-only for now.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_URL = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_READONLY_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function googleRedirectUri(): string {
  return `${appUrl()}/api/connections/google/callback`;
}

export function buildConsentUrl(state: string, scopes: string[] = GMAIL_READONLY_SCOPES): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force refresh-token issuance on re-consent
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number; scope?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.email ?? null;
}

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
}

/** List recent message ids matching a Gmail search query. */
export async function listMessageIds(
  accessToken: string,
  query: string,
  max: number
): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(max) });
  const res = await fetch(`${GMAIL_URL}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail list ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.messages || []).map((m: { id: string }) => m.id);
}

/** Fetch subject/from/snippet for a single message (metadata only). */
export async function getMessageMeta(accessToken: string, id: string): Promise<GmailMessage> {
  const params = new URLSearchParams();
  params.append("format", "metadata");
  params.append("metadataHeaders", "Subject");
  params.append("metadataHeaders", "From");
  const res = await fetch(`${GMAIL_URL}/messages/${id}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail get ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const headers: Array<{ name: string; value: string }> = data?.payload?.headers || [];
  const header = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
  return {
    id,
    subject: header("Subject") || "(no subject)",
    from: header("From"),
    snippet: data?.snippet || "",
  };
}
