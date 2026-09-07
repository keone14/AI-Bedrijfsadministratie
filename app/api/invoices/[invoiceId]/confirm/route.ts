import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { invoiceId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
  }

  // A confirmed invoice can feed financial totals. Never let a user accidentally
  // approve a record when the minimum fields for those totals are still unknown
  // or when the stored amounts contradict each other.
  // RLS keeps this lookup scoped to the user's own company data.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("invoice_type,subtotal,vat_amount,total")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    return NextResponse.json({ error: "De factuur kon niet betrouwbaar gecontroleerd worden." }, { status: 400 });
  }

  if (!invoice) {
    return NextResponse.json({ error: "Deze factuur is niet beschikbaar voor jouw bedrijf." }, { status: 404 });
  }

  const missing: string[] = [];
  if (invoice.invoice_type !== "purchase" && invoice.invoice_type !== "sale") missing.push("aankoop of verkoop");
  if (invoice.total === null) missing.push("totaalbedrag");

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Controleer eerst ${missing.join(" en ")}. Zonder ${missing.length === 1 ? "dit gegeven" : "deze gegevens"} kan het dashboard je cijfers niet betrouwbaar bijwerken.`,
      },
      { status: 409 },
    );
  }

  if (invoice.subtotal !== null && invoice.vat_amount !== null && invoice.total !== null) {
    const subtotal = Number(invoice.subtotal);
    const vatAmount = Number(invoice.vat_amount);
    const total = Number(invoice.total);
    const amountsAreValid = [subtotal, vatAmount, total].every(Number.isFinite);
    const amountsMatch = amountsAreValid && Math.abs((subtotal + vatAmount) - total) <= 0.02;

    if (!amountsMatch) {
      return NextResponse.json(
        {
          error: "Controleer eerst de bedragen. Bedrag zonder btw + btw komt niet overeen met het totaal. Pas de factuur aan voordat je ze bevestigt.",
        },
        { status: 409 },
      );
    }
  }

  const { error } = await supabase.rpc("confirm_invoice_extraction", {
    target_invoice_id: invoiceId,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    const noExtraction = message.includes("no extraction");
    const denied = message.includes("access denied");
    return NextResponse.json(
      {
        error: noExtraction
          ? "Er zijn nog geen uitgelezen gegevens om te bevestigen."
          : denied
            ? "Deze factuur is niet beschikbaar voor jouw bedrijf."
            : "De bevestiging kon niet betrouwbaar worden opgeslagen.",
      },
      { status: noExtraction ? 409 : denied ? 404 : 400 },
    );
  }

  return NextResponse.json({ status: "confirmed" });
}
