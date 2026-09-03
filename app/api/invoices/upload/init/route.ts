import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);
const allowedClientMimes = new Set(["application/pdf", "image/jpeg", "image/png", ""]);

function extensionFromName(name: string) {
  const clean = name.trim();
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index + 1).toLowerCase() : "";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
  }

  let body: { filename?: string; size?: number; mimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige uploadaanvraag." }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename : "";
  const size = typeof body.size === "number" ? body.size : 0;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const extension = extensionFromName(filename);

  if (!filename || !allowedExtensions.has(extension) || !allowedClientMimes.has(mimeType)) {
    return NextResponse.json({ error: "Gebruik een PDF-, JPG- of PNG-bestand." }, { status: 400 });
  }

  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Een factuur mag maximaal 10 MB groot zijn." }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership?.company_id) {
    return NextResponse.json({ error: "Stel eerst je bedrijf in voordat je een factuur uploadt." }, { status: 409 });
  }

  const documentId = randomUUID();
  const canonicalExtension = extension === "jpeg" ? "jpg" : extension;
  const storagePath = `company/${membership.company_id}/documents/${documentId}/original.${canonicalExtension}`;

  return NextResponse.json({
    documentId,
    companyId: membership.company_id,
    storagePath,
    bucket: "company-documents",
    maxFileSize: MAX_FILE_SIZE,
  });
}
