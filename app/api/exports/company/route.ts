import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";

const columns = ["Gegeven", "Waarde"] as const;
function safeCsvCell(value: unknown) { let text = value === null || value === undefined ? "" : String(value); if (/^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
function labelValue(value: string | null, labels: Record<string, string>) { if (!value) return "Niet bevestigd"; return labels[value] ?? value; }
function belgianTodayIso() { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

    const companyContext = await resolveActiveCompany(supabase, user.id);
    if (companyContext.state === "error") return NextResponse.json({ error: "We konden je bedrijf nu niet betrouwbaar bepalen." }, { status: 500 });
    if (companyContext.state === "no_company") return NextResponse.json({ error: "Stel eerst je bedrijf in voordat je bedrijfsgegevens exporteert." }, { status: 409 });
    if (companyContext.state === "selection_required") return NextResponse.json({ error: "Kies eerst welk bedrijf je wilt gebruiken. We exporteren nooit gegevens van meerdere bedrijven samen." }, { status: 409 });
    const companyId = companyContext.companyId;

    const [{ data: company, error: companyError }, { data: membership, error: membershipError }] = await Promise.all([
      supabase.from("companies").select("name, enterprise_number, start_date, legal_form, occupation_status, vat_status, vat_frequency, activity_description_raw, sells_products_services, employee_status, profile_status, created_at, updated_at").eq("id", companyId).single(),
      supabase.from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).eq("status", "active").single(),
    ]);
    if (companyError || !company || membershipError || !membership) return NextResponse.json({ error: "Je bedrijfsgegevens konden nu niet betrouwbaar worden geëxporteerd." }, { status: 500 });

    const legalFormLabels = { sole_prop: "Eenmanszaak", company: "Vennootschap" }; const occupationLabels = { main: "Hoofdberoep", side: "Bijberoep" }; const yesNoLabels = { yes: "Ja", no: "Nee", unknown: "Niet bevestigd" }; const frequencyLabels = { monthly: "Maandelijks", quarterly: "Per kwartaal", not_applicable: "Niet van toepassing / vrijgesteld", unknown: "Niet bevestigd" }; const sellsLabels = { products: "Producten", services: "Diensten", both: "Producten en diensten", unknown: "Niet bevestigd" }; const employeeLabels = { solo: "Ik werk alleen", employees: "Met personeel", unknown: "Niet bevestigd" }; const profileLabels = { complete: "Compleet", incomplete: "Onvolledig" }; const roleLabels = { owner: "Eigenaar", admin: "Beheerder", member: "Gebruiker", viewer: "Alleen lezen" };
    const rows: Array<[string, unknown]> = [["Bedrijfsnaam", company.name], ["Ondernemingsnummer", company.enterprise_number ?? "Niet bevestigd"], ["Startdatum", company.start_date ?? "Niet bevestigd"], ["Rechtsvorm", labelValue(company.legal_form, legalFormLabels)], ["Hoofd- of bijberoep", labelValue(company.occupation_status, occupationLabels)], ["Btw-plichtig", labelValue(company.vat_status, yesNoLabels)], ["Btw-aangifteritme", labelValue(company.vat_frequency, frequencyLabels)], ["Activiteit", company.activity_description_raw ?? "Niet bevestigd"], ["Verkoopt", labelValue(company.sells_products_services, sellsLabels)], ["Personeel", labelValue(company.employee_status, employeeLabels)], ["Profielstatus", labelValue(company.profile_status, profileLabels)], ["Jouw toegangsrol", labelValue(membership.role ?? null, roleLabels)], ["Profiel aangemaakt", company.created_at], ["Profiel laatst gewijzigd", company.updated_at], ["Export gemaakt op", belgianTodayIso()]];
    const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(safeCsvCell).join(";")).join("\r\n")}`;
    return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bedrijfsgegevens-export-${belgianTodayIso()}.csv"`, "Cache-Control": "private, no-store, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "De export kon nu niet betrouwbaar worden gemaakt. Probeer opnieuw." }, { status: 500 }); }
}
