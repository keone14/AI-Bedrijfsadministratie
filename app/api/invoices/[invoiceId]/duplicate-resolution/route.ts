import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(2);

  if (membershipError) {
    return NextResponse.json({ error: "Je bedrijfsrechten konden niet betrouwbaar gecontroleerd worden." }, { status: 503 });
  }
  if (!memberships?.length) {
    return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });
  }
  if (memberships.length > 1) {
    return NextResponse.json(
      {
        error: "Je hebt toegang tot meerdere bedrijven. Je keuze is bewust niet opgeslagen omdat we nooit zelf kiezen voor welk bedrijf je werkt.",
        code: "COMPANY_SELECTION_REQUIRED",
      },
      { status: 409 },
    );
  }

  const companyId = memberships[0].company_id as string;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (invoiceError) {
    return NextResponse.json({ error: "De factuur kon niet betrouwbaar gecontroleerd worden." }, { status: 400 });
  }
  if (!invoice) {
    return NextResponse.json({ error: "Deze factuur is niet beschikbaar voor jouw bedrijf." }, { status: 404 });
  }

  let body: { distinct?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (typeof body.distinct !== "boolean") {
    return NextResponse.json({ error: "Kies of deze factuur wel of niet apart moet tellen." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_invoice_duplicate_resolution", {
    target_invoice_id: invoiceId,
    target_is_distinct: body.distinct,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("company access denied") || message.includes("invoice not found")) {
      return NextResponse.json({ error: "Deze factuur is niet beschikbaar binnen je actieve bedrijfsgegevens." }, { status: 404 });
    }
    return NextResponse.json({ error: "We konden je keuze niet betrouwbaar bewaren. Er is niets aan de dashboardberekening veranderd." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, distinct: body.distinct });
}
