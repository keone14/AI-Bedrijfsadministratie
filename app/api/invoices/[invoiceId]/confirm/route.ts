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
