import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

const PAGE_SIZE = 1000;
const columns = ["Factuurdatum", "Vervaldatum", "Type", "Leverancier", "Klant", "Factuurnummer", "Categorie", "Omschrijving", "Bedrag zonder btw", "Btw", "Totaal", "Valuta", "Status"] as const;
type InvoiceRow = { supplier_name: string | null; customer_name: string | null; invoice_number: string | null; invoice_date: string | null; due_date: string | null; currency: string | null; subtotal: number | null; vat_amount: number | null; total: number | null; description: string | null; invoice_type: string | null; category_id: string | null; review_status: string; created_at: string };
type CategoryRow = { id: string; simple_label: string };

function safeCsvCell(value: unknown) { let text = value === null || value === undefined ? "" : String(value); if (/^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
function typeLabel(value: string | null) { if (value === "purchase") return "Aankoop"; if (value === "sale") return "Verkoop"; return "Niet bevestigd"; }
function statusLabel(value: string) { if (value === "confirmed") return "Door gebruiker bevestigd"; if (value === "auto_verified") return "Automatisch in orde"; if (value === "needs_review") return "Nog nakijken"; return "Niet bevestigd"; }
function belgianTodayIso() { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function validIsoDate(value: string | null) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; }
function exportFilename(from: string | null, to: string | null) { const today = belgianTodayIso(); if (from && to) return `facturen-export-${from}-tot-${to}.csv`; if (from) return `facturen-export-vanaf-${from}.csv`; if (to) return `facturen-export-tot-${to}.csv`; return `facturen-export-${today}.csv`; }

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const from = url.searchParams.get("from")?.trim() || null; const to = url.searchParams.get("to")?.trim() || null;
    if ((from && !validIsoDate(from)) || (to && !validIsoDate(to))) return NextResponse.json({ error: "Kies een geldige begin- en einddatum voor je export." }, { status: 400 });
    if (from && to && from > to) return NextResponse.json({ error: "De begindatum van je export kan niet na de einddatum liggen." }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
    const company = await resolveActiveCompany(supabase, user.id);
    if (company.state === "error") return NextResponse.json({ error: "We konden je bedrijf nu niet betrouwbaar bepalen." }, { status: 500 });
    if (company.state === "no_company") return NextResponse.json({ error: "Stel eerst je bedrijf in voordat je facturen exporteert." }, { status: 409 });
    if (company.state === "selection_required") return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken. We exporteren nooit gegevens van meerdere bedrijven samen." }, { status: 409 });
    const companyId = company.companyId;

    const invoices: InvoiceRow[] = []; let offset = 0;
    while (true) {
      let query = supabase.from("invoices").select("supplier_name, customer_name, invoice_number, invoice_date, due_date, currency, subtotal, vat_amount, total, description, invoice_type, category_id, review_status, created_at").eq("company_id", companyId);
      if (from) query = query.gte("invoice_date", from); if (to) query = query.lte("invoice_date", to);
      const { data, error } = await query.order("invoice_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
      if (error) return NextResponse.json({ error: "Je facturen konden nu niet betrouwbaar worden geëxporteerd." }, { status: 500 });
      const page = (data ?? []) as InvoiceRow[]; invoices.push(...page); if (page.length < PAGE_SIZE) break; offset += PAGE_SIZE;
    }

    const categoryIds = Array.from(new Set(invoices.map((invoice) => invoice.category_id).filter((id): id is string => Boolean(id)))); const categories = new Map<string, string>();
    for (let index = 0; index < categoryIds.length; index += PAGE_SIZE) { const batch = categoryIds.slice(index, index + PAGE_SIZE); const { data, error } = await supabase.from("categories").select("id, simple_label").in("id", batch); if (error) return NextResponse.json({ error: "De categorieën konden niet veilig aan je export worden toegevoegd." }, { status: 500 }); for (const category of (data ?? []) as CategoryRow[]) categories.set(category.id, category.simple_label); }

    const rows = invoices.map((invoice) => [invoice.invoice_date, invoice.due_date, typeLabel(invoice.invoice_type), invoice.supplier_name, invoice.customer_name, invoice.invoice_number, invoice.category_id ? categories.get(invoice.category_id) ?? "Categorie niet beschikbaar" : "Niet bevestigd", invoice.description, invoice.subtotal, invoice.vat_amount, invoice.total, invoice.currency, statusLabel(invoice.review_status)]);
    const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(safeCsvCell).join(";")).join("\r\n")}`;
    return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFilename(from, to)}"`, "Cache-Control": "private, no-store, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "De export kon nu niet betrouwbaar worden gemaakt. Probeer opnieuw." }, { status: 500 }); }
}
