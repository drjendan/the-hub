import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { generateJSON, type AIProvider } from "@/lib/ai";

/**
 * Per-tenant BYO API keys. This module is the ONLY place a stored provider key
 * is decrypted, and it is server-only. The decrypted value is returned to a
 * caller in-process for the duration of a single AI call; it is never logged
 * here and never placed into anything that is serialized to the browser. The
 * masked-list helpers select only the non-secret `key_hint`.
 */

export const SUPPORTED_PROVIDERS: AIProvider[] = ["openai", "anthropic", "google"];

export interface MaskedProviderKey {
  provider: AIProvider;
  key_hint: string;
  model: string | null;
  updated_at: string;
}

export interface ResolvedTenantKey {
  provider: AIProvider;
  apiKey: string;
  model: string | null;
}

/** A masked, non-secret preview of a raw key — safe to show and to store. */
export function maskKey(raw: string): string {
  const k = raw.trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/** Resolution preference: honor AI_PROVIDER, else openai → anthropic → google. */
function preferenceOrder(): AIProvider[] {
  const base: AIProvider[] = ["openai", "anthropic", "google"];
  const pref = (process.env.AI_PROVIDER || "").toLowerCase() as AIProvider;
  return base.includes(pref) ? [pref, ...base.filter((p) => p !== pref)] : base;
}

/**
 * Masked list of an org's configured keys, for the settings UI. Reads through
 * the RLS (user) client and selects ONLY non-secret columns — the encrypted_key
 * column is not even granted to the browser role, so it can never come back.
 */
export async function listMaskedProviderKeys(orgId: string): Promise<MaskedProviderKey[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_provider_keys")
    .select("provider, key_hint, model, updated_at")
    .eq("organization_id", orgId);
  return (data || []) as MaskedProviderKey[];
}

/**
 * Resolve the tenant's preferred provider key for an agent RUN. Reads the
 * ciphertext via the service-role client and decrypts it server-side. Returns
 * null when the org has configured no usable key (the caller then falls back to
 * the platform env key).
 */
export async function getOrgProviderKey(orgId: string): Promise<ResolvedTenantKey | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("org_provider_keys")
    .select("provider, encrypted_key, model")
    .eq("organization_id", orgId);
  if (!data || data.length === 0) return null;

  const byProvider = new Map(data.map((r) => [r.provider as AIProvider, r]));
  for (const p of preferenceOrder()) {
    const row = byProvider.get(p);
    if (!row) continue;
    try {
      return { provider: p, apiKey: decryptSecret(row.encrypted_key), model: row.model ?? null };
    } catch {
      // Ciphertext that won't decrypt (e.g. the enc key was rotated) is skipped
      // so the run can still fall back to the platform key rather than fail.
      continue;
    }
  }
  return null;
}

/**
 * Decrypted key for a SPECIFIC provider for an org (vs. getOrgProviderKey which
 * returns the preferred one). Used by embeddings to find the org's OpenAI key.
 */
export async function getOrgKeyForProvider(orgId: string, provider: AIProvider): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("org_provider_keys")
    .select("encrypted_key")
    .eq("organization_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  try {
    return decryptSecret(data.encrypted_key);
  } catch {
    return null;
  }
}

/** Persist (insert or update) an org's key. Service-role; caller MUST be owner. */
export async function saveOrgProviderKey(args: {
  orgId: string;
  provider: AIProvider;
  apiKey: string;
  model: string | null;
  userId: string;
}): Promise<MaskedProviderKey> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("org_provider_keys")
    .upsert(
      {
        organization_id: args.orgId,
        provider: args.provider,
        encrypted_key: encryptSecret(args.apiKey),
        key_hint: maskKey(args.apiKey),
        model: args.model,
        created_by: args.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" }
    )
    .select("provider, key_hint, model, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as MaskedProviderKey;
}

/** Remove an org's key for a provider. Service-role; caller MUST be owner. */
export async function deleteOrgProviderKey(orgId: string, provider: AIProvider): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("org_provider_keys")
    .delete()
    .eq("organization_id", orgId)
    .eq("provider", provider);
  if (error) throw new Error(error.message);
}

/**
 * Cheap liveness check: one tiny call with the candidate key before we store it.
 * The candidate key is used only for this call and never logged. The provider's
 * raw error body is deliberately NOT surfaced (some providers echo a masked form
 * of the submitted key) — we return only an HTTP status hint.
 */
export async function validateProviderKey(
  provider: AIProvider,
  apiKey: string,
  model: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await generateJSON({
      provider,
      apiKey,
      model: model ?? undefined,
      system: 'Reply with the JSON {"ok":true} and nothing else.',
      user: "ping",
      temperature: 0,
      maxTokens: 256,
    });
    return { ok: true };
  } catch (err) {
    const code = (err as Error).message.match(/\b(\d{3})\b/)?.[1];
    return {
      ok: false,
      error: code
        ? `The provider rejected this key (HTTP ${code}). Check the key and try again.`
        : "Could not validate this key with the provider. Check the key and try again.",
    };
  }
}
