import Link from "next/link";
import type { DashboardFinancialSummary, DashboardTraceLine } from "@/lib/dashboard/financial-summary";

export type DashboardTraceInvoice = {
  id: string;
  title: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  documentType: "invoice" | "credit_note" | null;
};

function formatMoney(value: number | null, currency: string | null) {
  if (value === null || !currency) return null;
  try {
    return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function metricValue(value: number | null, summary: DashboardFinancialSummary) {
  if (summary.status === "error") return "Niet beschikbaar";
  if (summary.status === "mixed_currency") return "Meerdere valuta";
  const formatted = formatMoney(value, summary.currency);
  return formatted ?? "Nog geen betrouwbaar bedrag";
}

function TraceList({
  lines,
  invoices,
  currency,
}: {
  lines: DashboardTraceLine[];
  invoices: Map<string, DashboardTraceInvoice>;
  currency: string | null;
}) {
  if (!lines.length || !currency) {
    return <p className="muted trace-empty">Er is nu geen betrouwbaar gecombineerd bedrag waarvoor we bronfacturen kunnen tonen.</p>;
  }

  return (
    <div className="dashboard-trace-list">
      {lines.map((line) => {
        const invoice = invoices.get(line.invoiceId);
        const contribution = formatMoney(line.contribution, currency) ?? `${line.contribution.toFixed(2)} ${currency}`;
        return (
          <div className="dashboard-trace-row" key={`${line.invoiceId}-${line.basis}`} data-testid="dashboard-trace-row">
            <div>
              <strong>{invoice?.title ?? "Factuur"}</strong>
              <span>
                {invoice?.documentType === "credit_note" ? "Creditnota" : "Factuur"}
                {invoice?.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ""}
                {invoice?.invoiceDate ? ` · ${invoice.invoiceDate}` : ""}
              </span>
            </div>
            <div className="dashboard-trace-value">
              <strong>{contribution}</strong>
              <span>{line.basis === "vat" ? "bijdrage via btw" : "bijdrage via bedrag zonder btw"}</span>
            </div>
            <Link className="dashboard-trace-link" href="/facturen">Open facturenlijst</Link>
          </div>
        );
      })}
    </div>
  );
}

export default function FinancialOverview({
  summary,
  traceInvoices = [],
}: {
  summary: DashboardFinancialSummary;
  traceInvoices?: DashboardTraceInvoice[];
}) {
  const invoiceMap = new Map(traceInvoices.map((invoice) => [invoice.id, invoice]));
  const metrics = [
    {
      label: "Omzet",
      value: metricValue(summary.revenue, summary),
      testId: "dashboard-revenue",
      traceTestId: "dashboard-revenue-trace",
      trace: summary.traces.revenue,
      what: "De som van het bedrag zonder btw op betrouwbare verkoopfacturen in deze maand. Creditnota’s verlagen dit bedrag.",
      source: summary.reliableInvoiceCount
        ? `Gebaseerd op betrouwbare facturen in ${summary.period.label}. Open de bronfacturen hieronder om exact te zien welke regels dit bedrag vormen.`
        : `Er zijn nog geen betrouwbare facturen die voor ${summary.period.label} in dit bedrag mogen meetellen.`,
      unknown: "Facturen die nog gecontroleerd moeten worden tellen niet mee. Zo vermijden we dat een onzeker bedrag stilletjes in je omzet belandt.",
    },
    {
      label: "Zakelijke kosten",
      value: metricValue(summary.costs, summary),
      testId: "dashboard-costs",
      traceTestId: "dashboard-costs-trace",
      trace: summary.traces.costs,
      what: "De som van het bedrag zonder btw op betrouwbare aankoopfacturen in deze maand. Dit is een administratief overzicht, niet automatisch je fiscaal aftrekbare kost.",
      source: `Alleen betrouwbare aankoopfacturen uit ${summary.period.label} vormen dit bedrag.`,
      unknown: "Een factuur met twijfel, ontbrekende bedragen of een rekenfout wordt uitgesloten totdat ze betrouwbaar is.",
    },
    {
      label: "Verschil",
      value: metricValue(summary.difference, summary),
      testId: "dashboard-difference",
      traceTestId: "dashboard-difference-trace",
      trace: summary.traces.difference,
      what: "Omzet zonder btw min zakelijke kosten zonder btw uit dezelfde betrouwbare facturen.",
      source: "Elke verkoopfactuur draagt positief bij en elke aankoopfactuur negatief. Creditnota’s draaien de bijdrage om. De regels hieronder komen rechtstreeks uit dezelfde vaste berekening.",
      unknown: "Dit is niet automatisch je nettowinst of belastbaar inkomen. Daarvoor kunnen nog andere gegevens en regels nodig zijn.",
    },
    {
      label: "Geschatte btw",
      value: metricValue(summary.estimatedVatDifference, summary),
      testId: "dashboard-vat",
      traceTestId: "dashboard-vat-trace",
      trace: summary.traces.estimatedVatDifference,
      what: "Een voorlopige tussensom: btw op betrouwbare verkoopfacturen min de geregistreerde btw op betrouwbare aankoopfacturen.",
      source: "De regels hieronder tonen per factuur welke geregistreerde btw de tussensom verhoogt of verlaagt.",
      unknown: "Dit is geen definitieve btw-aangifte en beslist niet automatisch welke aankoop-btw fiscaal aftrekbaar is. Bij onvolledige data blijft dit dus alleen een voorzichtige schatting.",
    },
  ];

  return (
    <section className="grid grid-4 dashboard-metrics" aria-label={`Financieel overzicht voor ${summary.period.label}`}>
      {metrics.map((metric) => (
        <article className="card metric-card" key={metric.label}>
          <div className="metric-label">{metric.label}</div>
          <div className="kpi kpi-empty" data-testid={metric.testId}>{metric.value}</div>
          <details className="dashboard-trace" data-testid={metric.traceTestId}>
            <summary>Waar komt dit vandaan?</summary>
            <div className="dashboard-trace-body">
              <p className="muted">Dit zijn de facturen en exacte bijdragen die de vaste berekening voor dit bedrag gebruikt.</p>
              <TraceList lines={metric.trace} invoices={invoiceMap} currency={summary.currency} />
            </div>
          </details>
          <details className="help-details dashboard-help">
            <summary>Leg dit simpel uit</summary>
            <div className="help-details-body">
              <div><strong>Wat is dit?</strong><p>{metric.what}</p></div>
              <div><strong>Hoe wordt dit berekend?</strong><p>{metric.source}</p></div>
              <div><strong>Wat als we het niet zeker weten?</strong><p>{metric.unknown}</p></div>
            </div>
          </details>
        </article>
      ))}
    </section>
  );
}
