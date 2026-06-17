import { NextResponse } from "next/server";
import { currentOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB (under Vercel's ~4.5MB body cap)
const MAX_TEXT = 200_000; // safety cap on stored extracted text

/** Extract plain text from an uploaded PDF or Word .docx. */
async function extractText(file: File): Promise<{ text: string } | { error: string }> {
  if (file.size > MAX_FILE_BYTES) return { error: "File is too large (max 4 MB)." };
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
      const buf = new Uint8Array(await file.arrayBuffer());
      const { text } = await pdfExtract(await getDocumentProxy(buf), { mergePages: true });
      return { text };
    } catch (err) {
      return { error: `Could not read the PDF: ${(err as Error).message}` };
    }
  }

  if (
    name.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const mammoth = (await import("mammoth")).default;
      const buf = Buffer.from(await file.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { text: value };
    } catch (err) {
      return { error: `Could not read the Word document: ${(err as Error).message}` };
    }
  }

  return { error: "Unsupported file. Upload a PDF or Word .docx (legacy .doc isn't supported)." };
}

/**
 * POST /api/knowledge/documents  (multipart: file, title?)
 * Extracts text from a PDF/.docx and stores it as a knowledge document. Click
 * "Sync knowledge" afterward to embed it into the RAG corpus. Admin/owner only.
 */
export async function POST(req: Request) {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can manage governance knowledge." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  const res = await extractText(file);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  const text = res.text.trim().slice(0, MAX_TEXT);
  if (!text) {
    return NextResponse.json({ error: "No readable text found (a scanned/image-only PDF would need OCR)." }, { status: 400 });
  }

  const titleField = typeof form.get("title") === "string" ? (form.get("title") as string).trim() : "";
  const title = titleField || file.name;

  const supabase = createClient();
  const { error } = await supabase.from("knowledge_documents").insert({
    organization_id: admin.orgId,
    title,
    filename: file.name,
    content: text,
    created_by: admin.user.id,
  });
  if (error) {
    return NextResponse.json(
      { error: error.code === "42P01" ? "Knowledge documents aren't enabled yet. Run supabase/knowledge_docs.sql." : error.message },
      { status: error.code === "42P01" ? 400 : 500 }
    );
  }
  return NextResponse.json({ ok: true, title, chars: text.length });
}

/** DELETE { id } — remove a knowledge document. */
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
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
