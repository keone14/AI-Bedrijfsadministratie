import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calculateDashboardFinancialSummary,
  currentBelgianMonthPeriod,
  type DashboardFinancialSummary,
  type DashboardInvoice,
} from "@/lib/dashboard/financial-summary";
import FinancialOverview from "./financial-overview";
import "./dashboard.css";
import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

const nav = [
  { label: "Dashboard", href: "/dashboard", active: true },
  { label: "Facturen", href: "/facturen" },
  { label: "Documenten", href: null },
  { label: "Deadlines", href: null },
  { label: "Assistent", href: null },
  { label: "Bedrijf", href: "/onboarding" },
];

const invoicePageSize = 1000;
const documentBatchSize = 200;

type InvoiceRow = {
  id: string;
  document_id: string;
  supplier_name: string | null;
  customer_name: string | null;
  invoice_type: string | null;
  invoice_date: string | null;
  currency: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  review_status: string;
  created_at: string;
};

type DocumentRow = { id: string; document_type: string | null };

type DashboardData = {
  summary: DashboardFinancialSummary;
  recentInvoices: InvoiceRow[];
  companyState: "ready" | "no_company" | "multiple_companies" | "error";
  totalInvoiceCount: number;
};

function emptySummary(status: "no_data" | "error"): DashboardFinancialSummary {
  return {
    status,
    period: currentBelgianMonthPeriod(),
    currency: null,
    currencies: [],
    revenue: null,
    costs: null,
    difference: null,
    vatReceived: null,
    vatOnPurchases: null,
    estimatedVatDifference: null,
    includedInvoiceIds: [],
    excludedInvoiceIds: [],
    reliableInvoiceCount: 0,
    needsReviewCount: 0,
    undatedInvoiceCount: 0,
    calculationVersion: "dashboard-v1-2026-09-03",
  };
}

function toNumber(value: number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadDashboardData(): Promise<DashboardData> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { summary: emptySummary("error"), recentInvoices: [], companyState: "error", totalInvoiceCount: 0 };

    const { data: memberships, error: membershipError } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(2);

    if (membershipError) return { summary: emptySummary("error"), recentInvoices: [], companyState: "error", totalInvoiceCount: 0 };
    if (!memberships?.length) return { summary: emptySummary("no_data"), recentInvoices: [], companyState: "no_company", totalInvoiceCount: 0 };
    if (memberships.length > 1) return { summary: emptySummary("error"), recentInvoices: [], companyState: "multiple_companies", totalInvoiceCount: 0 };

    const companyId = memberships[0].company_id as string;
    const invoices: InvoiceRow[] = [];
    let offset = 0;

    while (true) {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, document_id, supplier_name, customer_name, invoice_type, invoice_date, currency, subtotal, vat_amount, total, review_status, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(offset, offset + invoicePageSize - 1);

      if (invoiceError) return { summary: emptySummary("error"), recentInvoices: [], companyState: "error", totalInvoiceCount: 0 };
      const page = (invoiceData ?? []) as InvoiceRow[];
      invoices.push(...page);
      if (page.length < invoicePageSize) break;
      offset += invoicePageSize;
    }

    const documentIds = Array.from(new Set(invoices.map((invoice) => invoice.document_id)));
    const documents = new Map<string, DocumentRow>();

    for (let index = 0; index < documentIds.length; index += documentBatchSize) {
      const batch = documentIds.slice(index, index + documentBatchSize);
      const { data: documentData, error: documentError } = await supabase
        .from("documents")
        .select("id, document_type")
        .eq("company_id", companyId)
        .in("id", batch);
      if (documentError) return { summary: emptySummary("error"), recentInvoices: [], companyState: "error", totalInvoiceCount: invoices.length };
      for (const document of (documentData ?? []) as DocumentRow[]) documents.set(document.id, document);
    }

    const calculationRows: DashboardInvoice[] = invoices.map((invoice) => ({
      id: invoice.id,
      invoiceType: invoice.invoice_type === "purchase" || invoice.invoice_type === "sale" ? invoice.invoice_type : null,
      invoiceDate: invoice.invoice_date,
      currency: invoice.currency,
      subtotal: toNumber(invoice.subtotal),
      vatAmount: toNumber(invoice.vat_amount),
      total: toNumber(invoice.total),
      reviewStatus: invoice.review_status,
      documentType: documents.get(invoice.document_id)?.document_type === "credit_note"
        ? "credit_note"
        : documents.get(invoice.document_id)?.document_type === "invoice"
          ? "invoice"
          : null,
    }));

    return {
      summary: calculateDashboardFinancialSummary(calculationRows, currentBelgianMonthPeriod()),
      recentInvoices: invoices.slice(0, 5),
      companyState: "ready",
      totalInvoiceCount: invoices.length,
    };
  } catch {
    return { summary: emptySummary("error"), recentInvoices: [], companyState: "error", totalInvoiceCount: 0 };
  }
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "Bedrag niet betrouwbaar beschikbaar";
  if (!currency) return `${value.toFixed(2)} (valuta niet bevestigd)`;
  try { return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

export default async function DashboardPage() {
  const data = await loadDashboardData();
  const { summary } = data;
  const issueCount = summary.needsReviewCount + summary.undatedInvoiceCount;

  const statusCopy = data.companyState === "multiple_companies"
    ? { label: "Kies eerst welk bedrijf je wilt bekijken", detail: "We tellen nooit gegevens van meerdere bedrijven stilletjes bij elkaar op." }
    : data.companyState === "error" || summary.status === "error"
      ? { label: "We konden je dashboard nu niet betrouwbaar berekenen", detail: "Er wordt geen oud of geschat bedrag ingevuld. Probeer de pagina opnieuw." }
      : issueCount > 0
        ? { label: `${issueCount} ${issueCount === 1 ? "punt" : "punten"} nog nakijken`, detail: "Alleen betrouwbare facturen tellen al mee. Onzekere facturen blijven buiten de totalen." }
        : summary.reliableInvoiceCount > 0
          ? { label: "Je betrouwbare facturen zijn verwerkt", detail: `Het financieel overzicht voor ${summary.period.label} is opnieuw uit de opgeslagen facturen berekend.` }
          : { label: "Nog niet genoeg gegevens voor een financieel overzicht", detail: "Zonder betrouwbare facturen tonen we geen verzonnen bedragen." };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Bedrijfsadministratie</div>
        <nav className="nav" aria-label="Hoofdnavigatie">
          {nav.map((item) =>
            item.href ? (
              <Link key={item.label} className={item.active ? "active" : ""} href={item.href}>{item.label}</Link>
            ) : (
              <span key={item.label} className="nav-disabled" aria-disabled="true" title="Dit onderdeel wordt nog gebouwd">{item.label}<small>Nog niet beschikbaar</small></span>
            ),
          )}
        </nav>
      </aside>

      <main className="main dashboard-main">
        <header className="dashboard-heading">
          <div>
            <div className="eyebrow">Dashboard · {summary.period.label}</div>
            <h1>Je administratie, zonder giswerk.</h1>
            <p className="muted">Na een betrouwbare factuurbevestiging worden deze bedragen opnieuw uit de opgeslagen facturen berekend.</p>
          </div>
          <div className="dashboard-heading-actions">
            <Link className="button secondary" href="/facturen">Facturen bekijken</Link>
            <Link className="button secondary" href="/onboarding">Bedrijfsgegevens bekijken</Link>
            <LogoutButton />
          </div>
        </header>

        <section className="card dashboard-status-card" aria-labelledby="status-title">
          <div className={`status ${issueCount > 0 ? "status-review" : "status-neutral"}`}>
            <span className={`dot ${issueCount > 0 ? "dot-review" : "dot-neutral"}`} />
            <span id="status-title">{statusCopy.label}</span>
          </div>
          <p className="muted">{statusCopy.detail}</p>
          {summary.status === "mixed_currency" ? <p className="dashboard-warning">Meerdere valuta gevonden: {summary.currencies.join(", ")}. We maken daar bewust geen fout gecombineerd totaal van.</p> : null}
        </section>

        <FinancialOverview summary={summary} />

        <section className="dashboard-lower-grid">
          <article className="card action-card">
            <div className="card-heading-row"><h2>Wat moet er nu gebeuren?</h2><span className="soft-badge">Alleen wat nodig is</span></div>
            {summary.needsReviewCount > 0 ? (
              <div className="action-item"><div className="action-number">1</div><div><strong>Controleer {summary.needsReviewCount} factuur{summary.needsReviewCount === 1 ? "" : "en"}</strong><p className="muted">Die tellen nog niet mee in het financieel overzicht totdat ze betrouwbaar zijn.</p></div></div>
            ) : (
              <p className="muted">Er staat vanuit de factuurcontrole voor deze maand niets open dat we hier kunstmatig als taak moeten tonen.</p>
            )}
            <Link className="button secondary" href="/facturen">Facturen controleren</Link>
          </article>

          <article className="card">
            <h2>Betrouwbaarheid van dit overzicht</h2>
            <div className="kpi kpi-empty">{summary.reliableInvoiceCount} betrouwbare factuur{summary.reliableInvoiceCount === 1 ? "" : "en"}</div>
            <p className="muted">{summary.undatedInvoiceCount > 0 ? `${summary.undatedInvoiceCount} factuur${summary.undatedInvoiceCount === 1 ? " heeft" : "en hebben"} nog geen betrouwbare datum en kan daarom nog niet veilig aan deze maand worden toegewezen.` : "Facturen zonder betrouwbare status worden niet stilletjes in de totalen opgenomen."}</p>
          </article>

          <article className="card">
            <h2>Recente facturen</h2>
            {data.recentInvoices.length ? (
              <div className="dashboard-recent-list">
                {data.recentInvoices.map((invoice) => (
                  <div className="dashboard-recent-item" key={invoice.id}>
                    <div><strong>{invoice.supplier_name ?? invoice.customer_name ?? "Factuur"}</strong><span>{invoice.invoice_date ?? "Datum nog niet betrouwbaar"}</span></div>
                    <div><strong>{formatMoney(toNumber(invoice.total), invoice.currency)}</strong><span>{invoice.review_status === "confirmed" ? "Door jou bevestigd" : invoice.review_status === "auto_verified" ? "Automatisch in orde" : "Nog nakijken"}</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state"><strong>Nog geen facturen toegevoegd</strong><p className="muted">Zodra er facturen zijn, verschijnt hier alleen echte bedrijfsdata.</p></div>
            )}
            {data.totalInvoiceCount > data.recentInvoices.length ? <Link className="text-button" href="/facturen">Bekijk alle facturen</Link> : null}
          </article>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">
        <Link className="active" href="/dashboard">Home</Link><Link href="/facturen">Facturen</Link><Link href="/onboarding">Bedrijf</Link><span aria-disabled="true">Deadlines</span><span aria-disabled="true">Meer</span>
      </nav>
    </div>
  );
}
