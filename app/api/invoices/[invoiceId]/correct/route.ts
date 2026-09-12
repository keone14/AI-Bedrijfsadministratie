import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

type RouteContext = { params: Promise<{ invoiceId: string }> };
const invoiceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nullableText = (max: number) => z.string().trim().max(max).nullable();
function isRealIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const nullableDate = z.string().refine(isRealIsoDate, { message: "Controleer de datum. Gebruik een echte kalenderdatum." }).nullable();
const nullableMoney = z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).nullable();
const correctionsSchema = z.object({
  documentType: z.enum(["invoice", "credit_note"]).nullable().optional(), supplierName: nullableText(500).optional(), customerName: nullableText(500).optional(), invoiceNumber: nullableText(200).optional(), invoiceDate: nullableDate.optional(), dueDate: nullableDate.optional(), subtotal: nullableMoney.optional(), vatAmount: nullableMoney.optional(), total: nullableMoney.optional(), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(), description: nullableText(2000).optional(), invoiceType: z.enum(["purchase", "sale"]).nullable().optional(), categoryId: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "Pas minstens één veld aan." });

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "De aanpassing kon niet betrouwbaar gelezen worden." }, { status: 400 }); }
  const parsed = correctionsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Controleer de aangepaste velden." }, { status: 400 });

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return NextResponse.json({ error: "Je bedrijfsrechten konden niet betrouwbaar gecontroleerd worden." }, { status: 503 });
  if (company.state === "no_company") return NextResponse.json({ error: "Geen actief bedrijf gevonden." }, { status: 409 });
  if (company.state === "selection_required") return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken voordat je een factuur aanpast.", code: "COMPANY_SELECTION_REQUIRED" }, { status: 409 });
  const companyId = company.companyId;

  const { invoiceId } = await context.params;
  if (!invoiceIdPattern.test(invoiceId)) return NextResponse.json({ error: "Dit factuurnummer is ongeldig. Open de factuur opnieuw vanuit je facturenlijst." }, { status: 400 });

  const { data: invoice, error: invoiceError } = await supabase.from("invoices").select("id").eq("id", invoiceId).eq("company_id", companyId).maybeSingle();
  if (invoiceError) return NextResponse.json({ error: "De factuur kon niet betrouwbaar gecontroleerd worden." }, { status: 400 });
  if (!invoice) return NextResponse.json({ error: "Deze factuur is niet beschikbaar voor het gekozen bedrijf." }, { status: 404 });

  const { error } = await supabase.rpc("correct_invoice_fields", { target_invoice_id: invoiceId, corrections: parsed.data });
  if (error) { const message = error.message?.toLowerCase() ?? ""; const notAllowed = message.includes("access denied") || message.includes("authentication required"); return NextResponse.json({ error: notAllowed ? "Deze factuur is niet beschikbaar voor het gekozen bedrijf." : "De aanpassingen konden niet veilig worden opgeslagen." }, { status: notAllowed ? 403 : 400 }); }
  return NextResponse.json({ status: "needs_review", message: "Je correcties zijn apart bewaard. De oorspronkelijke AI-uitlezing is niet overschreven." });
}
