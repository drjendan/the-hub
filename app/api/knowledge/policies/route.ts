import { NextResponse } from "next/server";
import { currentOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reembedSource, removeSource, entryContent } from "@/lib/knowledge-index";

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

/** POST { title, body?, category? } — create a policy in the active company. */
export async function POST(req: Request) {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can manage governance knowledge." }, { status: 403 });

  let body: { title?: unknown; body?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("policies")
    .insert({
      organization_id: admin.orgId,
      title,
      body: typeof body.body === "string" ? body.body : null,
      category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : null,
      created_by: admin.user.id,
    })
    .select("id")
    .single();
  if (error) return fail(error);
  await reembedSource(admin.orgId, "policy", data.id, title, [
    entryContent("Policy", title, typeof body.body === "string" ? body.body : null),
  ]);
  return NextResponse.json({ id: data.id });
}

/** PUT { id, title?, body?, category?, active? } — update a policy. */
export async function PUT(req: Request) {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can manage governance knowledge." }, { status: 403 });

  let body: { id?: unknown; title?: unknown; body?: unknown; category?: unknown; active?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.body === "string") patch.body = body.body;
  if (typeof body.category === "string") patch.category = body.category.trim() || null;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const supabase = createClient();
  const { data: updated, error } = await supabase
    .from("policies")
    .update(patch)
    .eq("id", id)
    .select("title, body, active")
    .single();
  if (error) return fail(error);
  if (updated.active) {
    await reembedSource(admin.orgId, "policy", id, updated.title, [entryContent("Policy", updated.title, updated.body)]);
  } else {
    await removeSource(admin.orgId, id);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE { id } — remove a policy. */
export async function DELETE(req: Request) {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can manage governance knowledge." }, { status: 403 });

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase.from("policies").delete().eq("id", id);
  if (error) return fail(error);
  await removeSource(admin.orgId, id);
  return NextResponse.json({ ok: true });
}
