import type { DashboardFinancialSummary } from "@/lib/dashboard/financial-summary";

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

export default function FinancialOverview({ summary }: { summary: DashboardFinancialSummary }) {
  const metrics = [
    {
      label: "Omzet",
      value: metricValue(summary.revenue, summary),
      testId: "dashboard-revenue",
      what: "De som van het bedrag zonder btw op betrouwbare verkoopfacturen in deze maand. Creditnota’s verlagen dit bedrag.",
      source: summary.reliableInvoiceCount
        ? `Gebaseerd op ${summary.reliableInvoiceCount} betrouwbare factuur${summary.reliableInvoiceCount === 1 ? "" : "en"} in ${summary.period.label}.`
        : `Er zijn nog geen betrouwbare facturen die voor ${summary.period.label} in dit bedrag mogen meetellen.`,
      unknown: "Facturen die nog gecontroleerd moeten worden tellen niet mee. Zo vermijden we dat een onzeker bedrag stilletjes in je omzet belandt.",
    },
    {
      label: "Zakelijke kosten",
      value: metricValue(summary.costs, summary),
      testId: "dashboard-costs",
      what: "De som van het bedrag zonder btw op betrouwbare aankoopfacturen in deze maand. Dit is een administratief overzicht, niet automatisch je fiscaal aftrekbare kost.",
      source: summary.reliableInvoiceCount
        ? `Dezelfde betrouwbare factuurset voor ${summary.period.label} wordt gebruikt. Alleen aankoopfacturen tellen hier mee.`
        : "Zonder betrouwbare aankoopfacturen tonen we geen verzonnen kostentotaal.",
      unknown: "Een factuur met twijfel, ontbrekende bedragen of een rekenfout wordt uitgesloten totdat ze betrouwbaar is.",
    },
    {
      label: "Verschil",
      value: metricValue(summary.difference, summary),
      testId: "dashboard-difference",
      what: "Omzet zonder btw min zakelijke kosten zonder btw uit dezelfde betrouwbare facturen.",
      source: "Dit wordt met vaste code berekend uit exact dezelfde periode en valuta als de twee bedragen hierboven.",
      unknown: "Dit is niet automatisch je nettowinst of belastbaar inkomen. Daarvoor kunnen nog andere gegevens en regels nodig zijn.",
    },
    {
      label: "Geschatte btw",
      value: metricValue(summary.estimatedVatDifference, summary),
      testId: "dashboard-vat",
      what: "Een voorlopige tussensom: btw op betrouwbare verkoopfacturen min de geregistreerde btw op betrouwbare aankoopfacturen.",
      source: "De app gebruikt alleen de btw-bedragen die op de betrouwbare facturen staan en rekent ze deterministisch samen.",
      unknown: "Dit is geen definitieve btw-aangifte en beslist niet automatisch welke aankoop-btw fiscaal aftrekbaar is. Bij onvolledige data blijft dit dus alleen een voorzichtige schatting.",
    },
  ];

  return (
    <section className="grid grid-4 dashboard-metrics" aria-label={`Financieel overzicht voor ${summary.period.label}`}>
      {metrics.map((metric) => (
        <article className="card metric-card" key={metric.label}>
          <div className="metric-label">{metric.label}</div>
          <div className="kpi kpi-empty" data-testid={metric.testId}>{metric.value}</div>
          <details className="help-details dashboard-help">
            <summary>Leg dit simpel uit</summary>
            <div className="help-details-body">
              <div><strong>Wat is dit?</strong><p>{metric.what}</p></div>
              <div><strong>Waar komt dit vandaan?</strong><p>{metric.source}</p></div>
              <div><strong>Wat als we het niet zeker weten?</strong><p>{metric.unknown}</p></div>
            </div>
          </details>
        </article>
      ))}
    </section>
  );
}
