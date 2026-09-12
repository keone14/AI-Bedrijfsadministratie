import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const documentIdSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const parsedDocumentId = documentIdSchema.safeParse(documentId);
  if (!parsedDocumentId.success) {
    return NextResponse.json({ error: "Dit documentnummer is ongeldig. Open het document opnieuw vanuit je documentenlijst." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return NextResponse.json({ error: "We konden je toegangsrechten nu niet betrouwbaar controleren. Probeer opnieuw. Dit betekent niet dat je document weg is." }, { status: 503 });
  if (company.state === "no_company") return NextResponse.json({ error: "Dit document kon niet veilig aan een toegankelijk bedrijf gekoppeld worden." }, { status: 403 });
  if (company.state === "selection_required") return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken voordat je een origineel document opent.", code: "COMPANY_SELECTION_REQUIRED" }, { status: 409 });

  const companyId = company.companyId;
  const { data: document, error: documentError } = await supabase.from("documents").select("id, company_id, storage_path").eq("id", parsedDocumentId.data).eq("company_id", companyId).maybeSingle();
  if (documentError) return NextResponse.json({ error: "We konden dit document nu niet betrouwbaar ophalen. Probeer opnieuw. Dit betekent niet dat het document verwijderd is." }, { status: 503 });
  if (!document) return NextResponse.json({ error: "Document niet gevonden in het gekozen bedrijf." }, { status: 404 });
  if (!document.storage_path) return NextResponse.json({ error: "Het document bestaat, maar het originele bestand is niet correct gekoppeld. Er is niets automatisch verwijderd." }, { status: 409 });

  const expectedPrefix = `company/${companyId}/documents/${document.id}/`;
  if (!document.storage_path.startsWith(expectedPrefix)) return NextResponse.json({ error: "De opslaglocatie van dit document klopt niet met de beveiligde bedrijfsmap. Het bestand wordt daarom niet geopend." }, { status: 409 });

  const { data: signed, error: signedUrlError } = await supabase.storage.from("company-documents").createSignedUrl(document.storage_path, 60);
  if (signedUrlError || !signed?.signedUrl) return NextResponse.json({ error: "Het originele document kon nu niet veilig geopend worden. Probeer opnieuw. Het document is hierdoor niet verwijderd." }, { status: 503 });

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
