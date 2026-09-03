export type DashboardInvoice = {
  id: string;
  invoiceType: "purchase" | "sale" | null;
  invoiceDate: string | null;
  currency: string | null;
  subtotal: number | null;
  vatAmount: number | null;
  total: number | null;
  reviewStatus: string;
  documentType: "invoice" | "credit_note" | null;
};

export type DashboardPeriod = {
  start: string;
  endExclusive: string;
  label: string;
};

export type DashboardTraceLine = {
  invoiceId: string;
  contribution: number;
  basis: "subtotal" | "vat";
};

export type DashboardMetricTraces = {
  revenue: DashboardTraceLine[];
  costs: DashboardTraceLine[];
  difference: DashboardTraceLine[];
  estimatedVatDifference: DashboardTraceLine[];
};

export type DashboardFinancialSummary = {
  status: "no_data" | "available" | "incomplete" | "mixed_currency" | "error";
  period: DashboardPeriod;
  currency: string | null;
  currencies: string[];
  revenue: number | null;
  costs: number | null;
  difference: number | null;
  vatReceived: number | null;
  vatOnPurchases: number | null;
  estimatedVatDifference: number | null;
  includedInvoiceIds: string[];
  excludedInvoiceIds: string[];
  traces: DashboardMetricTraces;
  reliableInvoiceCount: number;
  needsReviewCount: number;
  undatedInvoiceCount: number;
  calculationVersion: "dashboard-v1-2026-09-03";
};

const reliableStatuses = new Set(["confirmed", "auto_verified"]);

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validAmount(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
}

function inPeriod(date: string | null, period: DashboardPeriod) {
  return Boolean(date && date >= period.start && date < period.endExclusive);
}

function isReliableForTotals(invoice: DashboardInvoice) {
  if (!reliableStatuses.has(invoice.reviewStatus)) return false;
  if (invoice.invoiceType !== "purchase" && invoice.invoiceType !== "sale") return false;
  if (invoice.documentType !== "invoice" && invoice.documentType !== "credit_note") return false;
  if (!invoice.currency || !/^[A-Z]{3}$/.test(invoice.currency)) return false;
  if (!validAmount(invoice.subtotal) || !validAmount(invoice.vatAmount) || !validAmount(invoice.total)) return false;
  return Math.abs((invoice.subtotal + invoice.vatAmount) - invoice.total) <= 0.02;
}

function emptyTraces(): DashboardMetricTraces {
  return { revenue: [], costs: [], difference: [], estimatedVatDifference: [] };
}

export function currentBelgianMonthPeriod(now = new Date()): DashboardPeriod {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const endExclusive = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const label = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    month: "long",
    year: "numeric",
  }).format(now);

  return { start, endExclusive, label };
}

export function calculateDashboardFinancialSummary(
  invoices: DashboardInvoice[],
  period: DashboardPeriod,
): DashboardFinancialSummary {
  const datedInPeriod = invoices.filter((invoice) => inPeriod(invoice.invoiceDate, period));
  const undatedInvoiceCount = invoices.filter((invoice) => invoice.invoiceDate === null).length;
  const reliable = datedInPeriod.filter(isReliableForTotals);
  const excluded = datedInPeriod.filter((invoice) => !isReliableForTotals(invoice));
  const needsReviewCount = datedInPeriod.filter((invoice) => !reliableStatuses.has(invoice.reviewStatus)).length;
  const currencies = Array.from(new Set(reliable.map((invoice) => invoice.currency as string))).sort();

  const base = {
    period,
    currencies,
    includedInvoiceIds: reliable.map((invoice) => invoice.id),
    excludedInvoiceIds: excluded.map((invoice) => invoice.id),
    reliableInvoiceCount: reliable.length,
    needsReviewCount,
    undatedInvoiceCount,
    calculationVersion: "dashboard-v1-2026-09-03" as const,
  };

  if (!reliable.length) {
    return {
      ...base,
      status: excluded.length || undatedInvoiceCount ? "incomplete" : "no_data",
      currency: null,
      revenue: null,
      costs: null,
      difference: null,
      vatReceived: null,
      vatOnPurchases: null,
      estimatedVatDifference: null,
      traces: emptyTraces(),
    };
  }

  if (currencies.length !== 1) {
    return {
      ...base,
      status: "mixed_currency",
      currency: null,
      revenue: null,
      costs: null,
      difference: null,
      vatReceived: null,
      vatOnPurchases: null,
      estimatedVatDifference: null,
      traces: emptyTraces(),
    };
  }

  let revenue = 0;
  let costs = 0;
  let vatReceived = 0;
  let vatOnPurchases = 0;
  const traces = emptyTraces();

  for (const invoice of reliable) {
    const creditSign = invoice.documentType === "credit_note" ? -1 : 1;
    const subtotal = invoice.subtotal as number;
    const vat = invoice.vatAmount as number;

    if (invoice.invoiceType === "sale") {
      const revenueContribution = roundMoney(creditSign * subtotal);
      const vatContribution = roundMoney(creditSign * vat);
      revenue += revenueContribution;
      vatReceived += vatContribution;
      traces.revenue.push({ invoiceId: invoice.id, contribution: revenueContribution, basis: "subtotal" });
      traces.difference.push({ invoiceId: invoice.id, contribution: revenueContribution, basis: "subtotal" });
      traces.estimatedVatDifference.push({ invoiceId: invoice.id, contribution: vatContribution, basis: "vat" });
    } else {
      const costContribution = roundMoney(creditSign * subtotal);
      const differenceContribution = roundMoney(-costContribution);
      const purchaseVatContribution = roundMoney(creditSign * vat);
      const vatDifferenceContribution = roundMoney(-purchaseVatContribution);
      costs += costContribution;
      vatOnPurchases += purchaseVatContribution;
      traces.costs.push({ invoiceId: invoice.id, contribution: costContribution, basis: "subtotal" });
      traces.difference.push({ invoiceId: invoice.id, contribution: differenceContribution, basis: "subtotal" });
      traces.estimatedVatDifference.push({ invoiceId: invoice.id, contribution: vatDifferenceContribution, basis: "vat" });
    }
  }

  revenue = roundMoney(revenue);
  costs = roundMoney(costs);
  vatReceived = roundMoney(vatReceived);
  vatOnPurchases = roundMoney(vatOnPurchases);

  return {
    ...base,
    status: excluded.length || undatedInvoiceCount ? "incomplete" : "available",
    currency: currencies[0],
    revenue,
    costs,
    difference: roundMoney(revenue - costs),
    vatReceived,
    vatOnPurchases,
    estimatedVatDifference: roundMoney(vatReceived - vatOnPurchases),
    traces,
  };
}
