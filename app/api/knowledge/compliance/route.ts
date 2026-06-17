import { NextResponse } from "next/server";
import { currentOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reembedSource, removeSource } from "@/lib/knowledge-index";

export const runtime = "nodejs";

function fail(error: { message: string; code?: string }) {
  if (error.code === "42P01") {
    return NextResponse.json(
      { error: "Governance knowledge isn't enabled yet. Run supabase/governance_kb.sql." },
      { status: 400 }
    );
  }
  if (error.code === "42501") {
    return NextResponse.json({ error: "Only a company admin or owner can manage this." }, { status: 403 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

/** POST { pack_id } — enable a compliance pack for the active company. */
export async function POST(req: Request) {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can manage governance knowledge." }, { status: 403 });

  let body: { pack_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  if (!packId) return NextResponse.json({ error: "pack_id is required" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase
    .from("org_compliance_packs")
    .insert({ organization_id: admin.orgId, pack_id: packId, enabled_by: admin.user.id });
  // 23505 = already enabled — treat as success (idempotent).
  if (error && error.code !== "23505") return fail(error);

  const { data: pack } = await supabase.from("compliance_packs").select("name, requirements").eq("id", packId).maybeSingle();
  if (pack) {
    const reqs = Array.isArray(pack.requirements) ? (pack.requirements as string[]) : [];
    await reembedSource(admin.orgId, "compliance", packId, pack.name, reqs.map((r) => `${pack.name} requirement: ${r}`));
  }
  return NextResponse.json({ ok: true, enabled: true });
}

/** DELETE { pack_id } — disable a compliance pack for the active company. */
export async function DELETE(req: Request) {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can manage governance knowledge." }, { status: 403 });

  let body: { pack_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const packId = typeof body.pack_id === "string" ? body.pack_id : "";
  if (!packId) return NextResponse.json({ error: "pack_id is required" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase
    .from("org_compliance_packs")
    .delete()
    .eq("organization_id", admin.orgId)
    .eq("pack_id", packId);
  if (error) return fail(error);
  await removeSource(admin.orgId, packId);
  return NextResponse.json({ ok: true, enabled: false });
}
