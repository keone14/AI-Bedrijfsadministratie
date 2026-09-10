import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);
const allowedClientMimes = new Set(["application/pdf", "image/jpeg", "image/png", ""]);
const expectedClientMimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

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

  if (mimeType && expectedClientMimeByExtension[extension] !== mimeType) {
    return NextResponse.json(
      { error: "De bestandsnaam en het bestandstype komen niet overeen. Kies het originele PDF-, JPG- of PNG-bestand opnieuw." },
      { status: 400 },
    );
  }

  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Een factuur mag maximaal 10 MB groot zijn." }, { status: 400 });
  }

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") {
    return NextResponse.json({ error: "We konden je bedrijf nu niet betrouwbaar bepalen. Probeer opnieuw." }, { status: 500 });
  }
  if (company.state === "no_company") {
    return NextResponse.json({ error: "Stel eerst je bedrijf in voordat je een factuur uploadt." }, { status: 409 });
  }
  if (company.state === "selection_required") {
    return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken voordat je een factuur uploadt." }, { status: 409 });
  }

  const companyId = company.companyId;
  const rateLimit = await consumeRateLimit({
    userId: user.id,
    companyId,
    action: "invoice_upload_init",
    maxRequests: 60,
    windowSeconds: 600,
  });
  if (rateLimit.state === "unavailable") {
    return NextResponse.json({ error: "De veiligheidscontrole voor uploads is tijdelijk niet beschikbaar. Probeer opnieuw." }, { status: 503 });
  }
  if (rateLimit.state === "limited") {
    return NextResponse.json(
      { error: "Je hebt in korte tijd veel facturen gestart. Probeer straks opnieuw." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const documentId = randomUUID();
  const canonicalExtension = extension === "jpeg" ? "jpg" : extension;
  const storagePath = `company/${companyId}/documents/${documentId}/original.${canonicalExtension}`;

  return NextResponse.json({
    documentId,
    companyId,
    storagePath,
    bucket: "company-documents",
    maxFileSize: MAX_FILE_SIZE,
  });
}
