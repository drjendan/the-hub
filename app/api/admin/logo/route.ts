import { NextResponse } from "next/server";
import { getUser, ensureProfile, getOrgsForUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "company-logos";
const MAX_BYTES = 1_048_576; // 1 MB
const EXT_FOR: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Only a GLOBAL admin or an OWNER of the target company may manage its logo.
 * Returns the signed-in user id when allowed, else an error response.
 */
async function authorize(orgId: string) {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const profile = await ensureProfile(user);
  let allowed = profile.app_role === "admin";
  if (!allowed) {
    const orgs = await getOrgsForUser();
    allowed = orgs.some((o) => o.id === orgId && o.org_role === "owner");
  }
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: "Only a global admin or an owner of this company can manage its logo." },
        { status: 403 }
      ),
    };
  }
  return { userId: user.id };
}

/**
 * POST /api/admin/logo  (multipart form-data: file, org_id)
 * Validates the image, uploads it to the public company-logos bucket via the
 * service role, and stores the public URL on organizations.logo_url.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const orgId = String(form.get("org_id") || "");
  const file = form.get("file");
  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "A logo file is required" }, { status: 400 });

  const auth = await authorize(orgId);
  if (auth.error) return auth.error;

  const ext = EXT_FOR[file.type];
  if (!ext) return NextResponse.json({ error: "Logo must be a PNG, JPEG, or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Logo must be 1 MB or smaller." }, { status: 400 });

  const db = createAdminClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `${orgId}/logo-${Date.now()}.${ext}`;

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    return NextResponse.json(
      { error: `Upload failed: ${upErr.message}. Has supabase/logos.sql been run?` },
      { status: 500 }
    );
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
  const { error: updErr } = await db
    .from("organizations")
    .update({ logo_url: pub.publicUrl })
    .eq("id", orgId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ logo_url: pub.publicUrl });
}

/** DELETE /api/admin/logo  Body: { org_id } — clears the company's logo. */
export async function DELETE(req: Request) {
  let body: { org_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orgId = typeof body.org_id === "string" ? body.org_id : "";
  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

  const auth = await authorize(orgId);
  if (auth.error) return auth.error;

  const db = createAdminClient();
  const { error } = await db.from("organizations").update({ logo_url: null }).eq("id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
