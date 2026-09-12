import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { recordOperationalEvent } from "@/lib/observability/operational-event";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ROUTE_KEY = "invoice_upload_finalize";
const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const expectedMimeByExtension: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };
type FinalizeBody = { documentId?: string; storagePath?: string; originalFilename?: string };

function safeDisplayName(input: string) { return input.replace(/[\\/]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 180) || "factuur"; }
function detectMime(buffer: Buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return "image/png";
  return null;
}
function validatedStorageExtension(storagePath: string, companyId: string, documentId: string) {
  if (!documentIdPattern.test(documentId)) return null;
  const match = storagePath.match(/^company\/([^/]+)\/documents\/([^/]+)\/original\.(pdf|jpg|png)$/i);
  if (!match || match[1] !== companyId || match[2] !== documentId) return null;
  return match[3].toLowerCase();
}
async function discard(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, storagePath: string) { await supabase.rpc("discard_unregistered_upload", { target_storage_path: storagePath }); }
async function observeRequest(startedAt: number, companyId: string | null, statusCode: number, outcome: "success" | "failure" | "denied", errorCode?: string, entityId?: string) {
  await recordOperationalEvent({ companyId, eventType: "api_request", routeKey: ROUTE_KEY, outcome, durationMs: Date.now() - startedAt, statusCode, errorCode, entityId });
}
async function observeUpload(startedAt: number, companyId: string, eventType: "upload_completed" | "upload_failed", outcome: "success" | "failure", statusCode: number, errorCode?: string, entityId?: string) {
  const durationMs = Date.now() - startedAt;
  await Promise.all([
    recordOperationalEvent({ companyId, eventType, routeKey: ROUTE_KEY, outcome, durationMs, statusCode, errorCode, entityId }),
    recordOperationalEvent({ companyId, eventType: "api_request", routeKey: ROUTE_KEY, outcome, durationMs, statusCode, errorCode, entityId }),
  ]);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  let body: FinalizeBody;
  try { body = await request.json(); }
  catch {
    await observeRequest(startedAt, null, 400, "failure", "invalid_request_json");
    return NextResponse.json({ error: "Ongeldige uploadaanvraag." }, { status: 400 });
  }

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const originalFilename = typeof body.originalFilename === "string" ? body.originalFilename : "factuur";
  if (!documentId || !storagePath) {
    await observeRequest(startedAt, null, 400, "failure", "missing_upload_metadata");
    return NextResponse.json({ error: "Uploadgegevens ontbreken." }, { status: 400 });
  }

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") {
    await observeRequest(startedAt, null, 500, "failure", "company_context_error");
    return NextResponse.json({ error: "We konden je bedrijf nu niet betrouwbaar bepalen. Probeer opnieuw." }, { status: 500 });
  }
  if (company.state === "no_company") {
    await observeRequest(startedAt, null, 409, "failure", "no_company");
    return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });
  }
  if (company.state === "selection_required") {
    await observeRequest(startedAt, null, 409, "failure", "company_selection_required");
    return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken voordat we deze upload afronden." }, { status: 409 });
  }
  const companyId = company.companyId;

  const rateLimit = await consumeRateLimit({ userId: user.id, companyId, action: "invoice_upload_finalize", maxRequests: 60, windowSeconds: 600 });
  if (rateLimit.state === "unavailable") {
    await observeUpload(startedAt, companyId, "upload_failed", "failure", 503, "rate_limit_unavailable", documentId);
    return NextResponse.json({ error: "De veiligheidscontrole voor uploads is tijdelijk niet beschikbaar. Probeer opnieuw." }, { status: 503 });
  }
  if (rateLimit.state === "limited") {
    await observeUpload(startedAt, companyId, "upload_failed", "failure", 429, "rate_limited", documentId);
    return NextResponse.json({ error: "Je hebt in korte tijd veel facturen verwerkt. Probeer straks opnieuw." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const storageExtension = validatedStorageExtension(storagePath, companyId, documentId);
  if (!storageExtension) {
    const durationMs = Date.now() - startedAt;
    await Promise.all([
      recordOperationalEvent({ companyId, eventType: "authorization_denied", routeKey: ROUTE_KEY, outcome: "denied", durationMs, statusCode: 403, errorCode: "invalid_company_storage_path", entityId: documentId }),
      recordOperationalEvent({ companyId, eventType: "upload_failed", routeKey: ROUTE_KEY, outcome: "failure", durationMs, statusCode: 403, errorCode: "invalid_company_storage_path", entityId: documentId }),
      recordOperationalEvent({ companyId, eventType: "api_request", routeKey: ROUTE_KEY, outcome: "denied", durationMs, statusCode: 403, errorCode: "invalid_company_storage_path", entityId: documentId }),
    ]);
    return NextResponse.json({ error: "Deze upload hoort niet bij het gekozen bedrijf of heeft een ongeldige opslaglocatie." }, { status: 403 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from("company-documents").download(storagePath);
  if (downloadError || !fileBlob) {
    await observeUpload(startedAt, companyId, "upload_failed", "failure", 400, "storage_download_failed", documentId);
    return NextResponse.json({ error: "Het bestand kon niet veilig worden gecontroleerd." }, { status: 400 });
  }
  if (fileBlob.size < 1 || fileBlob.size > MAX_FILE_SIZE) {
    await discard(supabase, storagePath);
    await observeUpload(startedAt, companyId, "upload_failed", "failure", 400, "invalid_file_size", documentId);
    return NextResponse.json({ error: "Een factuur mag maximaal 10 MB groot zijn." }, { status: 400 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const detectedMime = detectMime(buffer);
  if (!detectedMime) {
    await discard(supabase, storagePath);
    await observeUpload(startedAt, companyId, "upload_failed", "failure", 400, "invalid_file_signature", documentId);
    return NextResponse.json({ error: "Het bestand is geen geldige PDF-, JPG- of PNG-factuur." }, { status: 400 });
  }
  if (expectedMimeByExtension[storageExtension] !== detectedMime) {
    await discard(supabase, storagePath);
    await observeUpload(startedAt, companyId, "upload_failed", "failure", 400, "mime_extension_mismatch", documentId);
    return NextResponse.json({ error: "De bestandsnaam en de werkelijke inhoud komen niet overeen. Exporteer of hernoem de factuur als PDF, JPG of PNG en probeer opnieuw." }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const displayName = safeDisplayName(originalFilename);
  const admin = createSupabaseAdminClient();
  const { data: invoiceId, error: registerError } = await admin.rpc("register_validated_invoice_upload", {
    target_company_id: companyId, target_document_id: documentId, target_storage_path: storagePath, original_name: originalFilename.slice(0, 500), safe_display_name: displayName, detected_mime: detectedMime, sha256_hash: sha256, validated_size_bytes: buffer.byteLength, target_actor_user_id: user.id,
  });
  if (registerError) {
    await discard(supabase, storagePath);
    const duplicate = registerError.message?.toLowerCase().includes("duplicate document");
    await observeUpload(startedAt, companyId, "upload_failed", "failure", duplicate ? 409 : 400, duplicate ? "duplicate_document" : "registration_failed", documentId);
    return NextResponse.json({ error: duplicate ? "Deze factuur lijkt exact hetzelfde bestand te zijn als een factuur die al is opgeslagen." : "De factuur kon niet betrouwbaar worden geregistreerd." }, { status: duplicate ? 409 : 400 });
  }

  await observeUpload(startedAt, companyId, "upload_completed", "success", 200, undefined, invoiceId ?? documentId);
  return NextResponse.json({ invoiceId, documentId, displayName, mimeType: detectedMime, status: "uploaded" });
}
