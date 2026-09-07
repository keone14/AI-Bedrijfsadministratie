import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { invoiceId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) return NextResponse.json({ error: "Je bedrijfsrechten konden niet betrouwbaar gecontroleerd worden." }, { status: 400 });
  if (!membership?.company_id) return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });

  // Confirmation means this record may feed the financial dashboard. Keep the
  // confirmation gate aligned with the dashboard reliability rules and scope
  // every lookup explicitly to the active company, in addition to database RLS.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("invoice_type,invoice_date,currency,subtotal,vat_amount,total,document_id,company_id")
    .eq("id", invoiceId)
    .eq("company_id", membership.company_id)
    .maybeSingle();

  if (invoiceError) return NextResponse.json({ error: "De factuur kon niet betrouwbaar gecontroleerd worden." }, { status: 400 });
  if (!invoice) return NextResponse.json({ error: "Deze factuur is niet beschikbaar voor jouw bedrijf." }, { status: 404 });

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("document_type")
    .eq("id", invoice.document_id)
    .eq("company_id", membership.company_id)
    .maybeSingle();
  if (documentError || !document) return NextResponse.json({ error: "Het originele document kon niet betrouwbaar gecontroleerd worden." }, { status: 409 });

  const missing: string[] = [];
  if (document.document_type !== "invoice" && document.document_type !== "credit_note") missing.push("documenttype");
  if (invoice.invoice_type !== "purchase" && invoice.invoice_type !== "sale") missing.push("aankoop of verkoop");
  if (!invoice.invoice_date) missing.push("factuurdatum");
  if (!invoice.currency || !/^[A-Z]{3}$/.test(invoice.currency)) missing.push("valuta");
  if (invoice.subtotal === null) missing.push("bedrag zonder btw");
  if (invoice.vat_amount === null) missing.push("btw-bedrag");
  if (invoice.total === null) missing.push("totaalbedrag");

  if (missing.length > 0) {
    return NextResponse.json({ error: `Controleer eerst ${missing.join(" en ")}. Zonder ${missing.length === 1 ? "dit gegeven" : "deze gegevens"} kan de factuur niet betrouwbaar in je dashboard worden verwerkt.` }, { status: 409 });
  }

  const subtotal = Number(invoice.subtotal);
  const vatAmount = Number(invoice.vat_amount);
  const total = Number(invoice.total);
  const amountsAreValid = [subtotal, vatAmount, total].every(Number.isFinite);
  const amountsMatch = amountsAreValid && Math.abs((subtotal + vatAmount) - total) <= 0.02;
  if (!amountsMatch) return NextResponse.json({ error: "Controleer eerst de bedragen. Bedrag zonder btw + btw komt niet overeen met het totaal. Pas de factuur aan voordat je ze bevestigt." }, { status: 409 });

  const { error } = await supabase.rpc("confirm_invoice_extraction", { target_invoice_id: invoiceId });
  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    const noExtraction = message.includes("no extraction");
    const denied = message.includes("access denied");
    return NextResponse.json({ error: noExtraction ? "Er zijn nog geen uitgelezen gegevens om te bevestigen." : denied ? "Deze factuur is niet beschikbaar voor jouw bedrijf." : "De bevestiging kon niet betrouwbaar worden opgeslagen." }, { status: noExtraction ? 409 : denied ? 404 : 400 });
  }
  return NextResponse.json({ status: "confirmed" });
}
