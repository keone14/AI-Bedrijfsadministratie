import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type FinalizeBody = {
  documentId?: string;
  storagePath?: string;
  originalFilename?: string;
};

function safeDisplayName(input: string) {
  return input
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "factuur";
}

function detectMime(buffer: Buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

async function discard(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, storagePath: string) {
  await supabase.rpc("discard_unregistered_upload", { target_storage_path: storagePath });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
  }

  let body: FinalizeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige uploadaanvraag." }, { status: 400 });
  }

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const originalFilename = typeof body.originalFilename === "string" ? body.originalFilename : "factuur";

  if (!documentId || !storagePath) {
    return NextResponse.json({ error: "Uploadgegevens ontbreken." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership?.company_id) {
    return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });
  }

  const expectedPrefix = `company/${membership.company_id}/documents/${documentId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Deze upload hoort niet bij je bedrijf." }, { status: 403 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("company-documents")
    .download(storagePath);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Het bestand kon niet veilig worden gecontroleerd." }, { status: 400 });
  }

  if (fileBlob.size < 1 || fileBlob.size > MAX_FILE_SIZE) {
    await discard(supabase, storagePath);
    return NextResponse.json({ error: "Een factuur mag maximaal 10 MB groot zijn." }, { status: 400 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const detectedMime = detectMime(buffer);
  if (!detectedMime) {
    await discard(supabase, storagePath);
    return NextResponse.json({ error: "Het bestand is geen geldige PDF-, JPG- of PNG-factuur." }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const displayName = safeDisplayName(originalFilename);

  const { data: invoiceId, error: registerError } = await supabase.rpc("register_validated_invoice_upload", {
    target_company_id: membership.company_id,
    target_document_id: documentId,
    target_storage_path: storagePath,
    original_name: originalFilename.slice(0, 500),
    safe_display_name: displayName,
    detected_mime: detectedMime,
    sha256_hash: sha256,
    validated_size_bytes: buffer.byteLength,
  });

  if (registerError) {
    await discard(supabase, storagePath);
    const duplicate = registerError.message?.toLowerCase().includes("duplicate document");
    return NextResponse.json(
      { error: duplicate ? "Deze factuur lijkt exact hetzelfde bestand te zijn als een factuur die al is opgeslagen." : "De factuur kon niet betrouwbaar worden geregistreerd." },
      { status: duplicate ? 409 : 400 },
    );
  }

  return NextResponse.json({
    invoiceId,
    documentId,
    displayName,
    mimeType: detectedMime,
    status: "uploaded",
  });
}
