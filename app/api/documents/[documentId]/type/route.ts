import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

const documentIdSchema = z.string().uuid();
const bodySchema = z.object({ type: z.enum(["tax", "insurance", "contract", "government", "other"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const parsedDocumentId = documentIdSchema.safeParse(documentId);
  if (!parsedDocumentId.success) {
    return NextResponse.json({ error: "Dit documentnummer is ongeldig. Open het document opnieuw vanuit je documentenlijst." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "De keuze kon niet betrouwbaar gelezen worden." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Kies een geldig documenttype." }, { status: 400 });

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return NextResponse.json({ error: "Je bedrijfsrechten konden niet betrouwbaar gecontroleerd worden." }, { status: 503 });
  if (company.state === "no_company") return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });
  if (company.state === "selection_required") return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken.", code: "COMPANY_SELECTION_REQUIRED" }, { status: 409 });

  const { data: document, error: documentError } = await supabase.from("documents").select("id").eq("id", parsedDocumentId.data).eq("company_id", company.companyId).maybeSingle();
  if (documentError) return NextResponse.json({ error: "Het document kon niet betrouwbaar gecontroleerd worden." }, { status: 503 });
  if (!document) return NextResponse.json({ error: "Dit document hoort niet bij het gekozen bedrijf." }, { status: 404 });

  const { error } = await supabase.rpc("set_document_type", { target_document_id: parsedDocumentId.data, target_document_type: parsed.data.type });
  if (error) return NextResponse.json({ error: "Het type kon niet veilig worden bevestigd. Er is niets als definitief opgeslagen." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
