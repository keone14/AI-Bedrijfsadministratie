import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

type RouteContext = { params: Promise<{ invoiceId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, context: RouteContext) {
  const { invoiceId } = await context.params;
  if (!UUID_PATTERN.test(invoiceId)) {
    return NextResponse.json(
      { error: "Dit factuurnummer is ongeldig. Open de factuur opnieuw vanuit je facturenlijst." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return NextResponse.json({ error: "Je bedrijfsrechten konden niet betrouwbaar gecontroleerd worden." }, { status: 503 });
  if (company.state === "no_company") return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });
  if (company.state === "selection_required") return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken voordat je een factuur bevestigt.", code: "COMPANY_SELECTION_REQUIRED" }, { status: 409 });
  const companyId = company.companyId;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("invoice_type,invoice_date,currency,subtotal,vat_amount,total,document_id,company_id")
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (invoiceError) return NextResponse.json({ error: "De factuur kon niet betrouwbaar gecontroleerd worden." }, { status: 400 });
  if (!invoice) return NextResponse.json({ error: "Deze factuur is niet beschikbaar voor het gekozen bedrijf." }, { status: 404 });

  const { data: document, error: documentError } = await supabase.from("documents").select("document_type").eq("id", invoice.document_id).eq("company_id", companyId).maybeSingle();
  if (documentError || !document) return NextResponse.json({ error: "Het originele document kon niet betrouwbaar gecontroleerd worden." }, { status: 409 });

  const missing: string[] = [];
  if (document.document_type !== "invoice" && document.document_type !== "credit_note") missing.push("documenttype");
  if (invoice.invoice_type !== "purchase" && invoice.invoice_type !== "sale") missing.push("aankoop of verkoop");
  if (!invoice.invoice_date) missing.push("factuurdatum");
  if (!invoice.currency || !/^[A-Z]{3}$/.test(invoice.currency)) missing.push("valuta");
  if (invoice.subtotal === null) missing.push("bedrag zonder btw");
  if (invoice.vat_amount === null) missing.push("btw-bedrag");
  if (invoice.total === null) missing.push("totaalbedrag");
  if (missing.length > 0) return NextResponse.json({ error: `Controleer eerst ${missing.join(" en ")}. Zonder ${missing.length === 1 ? "dit gegeven" : "deze gegevens"} kan de factuur niet betrouwbaar in je dashboard worden verwerkt.` }, { status: 409 });

  const subtotal = Number(invoice.subtotal); const vatAmount = Number(invoice.vat_amount); const total = Number(invoice.total);
  const amountsAreValid = [subtotal, vatAmount, total].every(Number.isFinite);
  const amountsMatch = amountsAreValid && Math.abs((subtotal + vatAmount) - total) <= 0.02;
  if (!amountsMatch) return NextResponse.json({ error: "Controleer eerst de bedragen. Bedrag zonder btw + btw komt niet overeen met het totaal. Pas de factuur aan voordat je ze bevestigt." }, { status: 409 });

  const { error } = await supabase.rpc("confirm_invoice_extraction", { target_invoice_id: invoiceId });
  if (error) { const message = error.message?.toLowerCase() ?? ""; const noExtraction = message.includes("no extraction"); const denied = message.includes("access denied"); return NextResponse.json({ error: noExtraction ? "Er zijn nog geen uitgelezen gegevens om te bevestigen." : denied ? "Deze factuur is niet beschikbaar voor het gekozen bedrijf." : "De bevestiging kon niet betrouwbaar worden opgeslagen." }, { status: noExtraction ? 409 : denied ? 404 : 400 }); }
  return NextResponse.json({ status: "confirmed" });
}
