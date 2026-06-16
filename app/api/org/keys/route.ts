import { NextResponse } from "next/server";
import { currentOrgOwner } from "@/lib/auth";
import type { AIProvider } from "@/lib/ai";
import {
  SUPPORTED_PROVIDERS,
  listMaskedProviderKeys,
  saveOrgProviderKey,
  deleteOrgProviderKey,
  validateProviderKey,
} from "@/lib/provider-keys";

export const runtime = "nodejs";

function isProvider(v: unknown): v is AIProvider {
  return typeof v === "string" && SUPPORTED_PROVIDERS.includes(v as AIProvider);
}

/** GET /api/org/keys → masked list of the active org's configured keys. */
export async function GET() {
  const owner = await currentOrgOwner();
  if (!owner) return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const keys = await listMaskedProviderKeys(owner.orgId);
  return NextResponse.json({ keys });
}

/**
 * PUT /api/org/keys  Body: { provider, api_key, model? }
 * Validates the key against the provider with a cheap test call, then stores it
 * encrypted. The raw key is never persisted in plaintext, never logged, and the
 * response echoes only the masked hint.
 */
export async function PUT(req: Request) {
  const owner = await currentOrgOwner();
  if (!owner) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  let body: { provider?: unknown; api_key?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!apiKey) return NextResponse.json({ error: "API key is required" }, { status: 400 });
  const model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;

  // Validate the candidate key BEFORE saving anything.
  const check = await validateProviderKey(body.provider, apiKey, model);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const saved = await saveOrgProviderKey({
    orgId: owner.orgId,
    provider: body.provider,
    apiKey,
    model,
    userId: owner.user.id,
  });
  return NextResponse.json({ key: saved });
}

/** DELETE /api/org/keys  Body: { provider } → remove the org's key for it. */
export async function DELETE(req: Request) {
  const owner = await currentOrgOwner();
  if (!owner) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  let body: { provider?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  await deleteOrgProviderKey(owner.orgId, body.provider);
  return NextResponse.json({ ok: true });
}
