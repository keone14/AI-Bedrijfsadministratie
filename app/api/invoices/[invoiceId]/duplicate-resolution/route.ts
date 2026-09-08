import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
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
