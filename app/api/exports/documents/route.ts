import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const MAX_DOCUMENTS = 100;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
type DocumentRow = { id: string; storage_path: string | null; original_filename: string; created_at: string };
type ZipEntry = { name: Uint8Array; data: Uint8Array; crc: number; offset: number };

function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function safeFilename(value: string, fallback: string) { const cleaned = value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 160); return cleaned || fallback; }
function uniqueFilename(filename: string, used: Set<string>) { const key = filename.toLocaleLowerCase("nl-BE"); if (!used.has(key)) { used.add(key); return filename; } const dot = filename.lastIndexOf("."); const stem = dot > 0 ? filename.slice(0, dot) : filename; const extension = dot > 0 ? filename.slice(dot) : ""; let counter = 2; while (used.has(`${stem} (${counter})${extension}`.toLocaleLowerCase("nl-BE"))) counter += 1; const candidate = `${stem} (${counter})${extension}`; used.add(candidate.toLocaleLowerCase("nl-BE")); return candidate; }
function writeUint16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function writeUint32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }
function makeStoredZip(files: Array<{ filename: string; data: Uint8Array }>) {
  const encoder = new TextEncoder(); const entries: ZipEntry[] = []; let localSize = 0;
  for (const file of files) { const name = encoder.encode(file.filename); entries.push({ name, data: file.data, crc: crc32(file.data), offset: localSize }); localSize += 30 + name.length + file.data.length; }
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.name.length, 0); const output = new Uint8Array(localSize + centralSize + 22); const view = new DataView(output.buffer); let cursor = 0;
  for (const entry of entries) { writeUint32(view,cursor,0x04034b50); writeUint16(view,cursor+4,20); writeUint16(view,cursor+6,0x0800); writeUint16(view,cursor+8,0); writeUint16(view,cursor+10,0); writeUint16(view,cursor+12,0); writeUint32(view,cursor+14,entry.crc); writeUint32(view,cursor+18,entry.data.length); writeUint32(view,cursor+22,entry.data.length); writeUint16(view,cursor+26,entry.name.length); writeUint16(view,cursor+28,0); output.set(entry.name,cursor+30); output.set(entry.data,cursor+30+entry.name.length); cursor += 30 + entry.name.length + entry.data.length; }
  const centralOffset = cursor;
  for (const entry of entries) { writeUint32(view,cursor,0x02014b50); writeUint16(view,cursor+4,20); writeUint16(view,cursor+6,20); writeUint16(view,cursor+8,0x0800); writeUint16(view,cursor+10,0); writeUint16(view,cursor+12,0); writeUint16(view,cursor+14,0); writeUint32(view,cursor+16,entry.crc); writeUint32(view,cursor+20,entry.data.length); writeUint32(view,cursor+24,entry.data.length); writeUint16(view,cursor+28,entry.name.length); writeUint16(view,cursor+30,0); writeUint16(view,cursor+32,0); writeUint16(view,cursor+34,0); writeUint16(view,cursor+36,0); writeUint32(view,cursor+38,0); writeUint32(view,cursor+42,entry.offset); output.set(entry.name,cursor+46); cursor += 46 + entry.name.length; }
  writeUint32(view,cursor,0x06054b50); writeUint16(view,cursor+4,0); writeUint16(view,cursor+6,0); writeUint16(view,cursor+8,entries.length); writeUint16(view,cursor+10,entries.length); writeUint32(view,cursor+12,centralSize); writeUint32(view,cursor+16,centralOffset); writeUint16(view,cursor+20,0); return output;
}
function errorResponse(error: string, status: number) { const response = NextResponse.json({ error }, { status }); response.headers.set("Cache-Control", "private, no-store, max-age=0"); return response; }

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Je sessie is verlopen. Log opnieuw in.", 401);
  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return errorResponse("We konden je bedrijfsrechten nu niet betrouwbaar controleren. Probeer opnieuw.", 503);
  if (company.state === "no_company") return errorResponse("Stel eerst je bedrijf in voordat je documenten exporteert.", 409);
  if (company.state === "selection_required") return errorResponse("Kies eerst één actief bedrijf. We exporteren nooit documenten van meerdere bedrijven door elkaar.", 409);
  const companyId = company.companyId;

  const { count, error: countError } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (countError) return errorResponse("We konden het aantal documenten nu niet betrouwbaar controleren.", 503);
  if (!count) return errorResponse("Er zijn nog geen originele documenten om te exporteren.", 404);
  if (count > MAX_DOCUMENTS) return errorResponse(`Je hebt ${count} documenten. Een veilige export bevat maximaal ${MAX_DOCUMENTS} documenten per keer.`, 413);

  const { data, error: documentError } = await supabase.from("documents").select("id, storage_path, original_filename, created_at").eq("company_id", companyId).order("created_at", { ascending: true }).limit(MAX_DOCUMENTS);
  if (documentError) return errorResponse("We konden je documentlijst nu niet betrouwbaar ophalen. Er is niets verwijderd.", 503);

  const documents = (data ?? []) as DocumentRow[]; const usedNames = new Set<string>(); const files: Array<{ filename: string; data: Uint8Array }> = []; let totalBytes = 0;
  for (const document of documents) {
    if (!document.storage_path) return errorResponse(`Document ${document.original_filename} heeft geen veilige koppeling naar het originele bestand. De export is gestopt zodat niets ontbreekt zonder waarschuwing.`, 409);
    const expectedPrefix = `company/${companyId}/documents/${document.id}/`;
    if (!document.storage_path.startsWith(expectedPrefix)) return errorResponse("Een document heeft een opslagpad buiten de beveiligde bedrijfsmap. De export is uit veiligheid gestopt.", 409);
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("company-documents").download(document.storage_path);
    if (downloadError || !fileBlob) return errorResponse(`Het originele bestand ${document.original_filename} kon niet veilig worden opgehaald. De export is gestopt zodat je geen onvolledige back-up krijgt.`, 503);
    const bytes = new Uint8Array(await fileBlob.arrayBuffer()); totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) return errorResponse("De originele documenten zijn samen groter dan 50 MB. De export is gestopt voordat de server onnodig belast wordt.", 413);
    files.push({ filename: uniqueFilename(safeFilename(document.original_filename, `document-${document.id}`), usedNames), data: bytes });
  }

  const zip = makeStoredZip(files); const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const body = new Blob([zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)], { type: "application/zip" }); const response = new NextResponse(body, { status: 200 });
  response.headers.set("Content-Type", "application/zip"); response.headers.set("Content-Disposition", `attachment; filename="originele-documenten-${today}.zip"`); response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate"); response.headers.set("Pragma", "no-cache"); response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive"); return response;
}
