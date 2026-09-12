import { notFound } from "next/navigation";
import FinancialOverview, { type DashboardTraceInvoice, type DashboardVatStatus } from "../dashboard/financial-overview";
import "../dashboard/dashboard.css";
import {
  calculateDashboardFinancialSummary,
  type DashboardInvoice,
  type DashboardPeriod,
} from "@/lib/dashboard/financial-summary";
import { possibleDuplicateInvoiceIds, type DuplicateInvoiceCandidate } from "@/lib/invoices/duplicate-detection";

export const dynamic = "force-dynamic";

const period: DashboardPeriod = {
  start: "2026-09-01",
  endExclusive: "2026-10-01",
  label: "september 2026",
};

export default async function DashboardE2EFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; mixed?: string; credit?: string; vat?: string; unreliable?: string; duplicate?: string; distinct?: string }>;
}) {
  if (process.env.E2E_TEST_MODE !== "1") notFound();
  const { confirmed, mixed, credit, vat, unreliable, duplicate, distinct } = await searchParams;
  const vatStatus: DashboardVatStatus = vat === "unknown" ? "unknown" : vat === "no" ? "no" : "yes";

  const invoices: DashboardInvoice[] = [
    {
      id: "sale-1",
      invoiceType: "sale",
      invoiceDate: "2026-09-03",
      currency: "EUR",
      subtotal: 1000,
      vatAmount: 210,
      total: 1210,
      reviewStatus: confirmed === "1" ? "confirmed" : "pending",
      documentType: "invoice",
    },
    {
      id: "purchase-1",
      invoiceType: "purchase",
      invoiceDate: "2026-09-02",
      currency: mixed === "1" ? "USD" : unreliable === "1" ? null : "EUR",
      subtotal: 200,
      vatAmount: 42,
      total: 242,
      reviewStatus: "confirmed",
      documentType: "invoice",
    },
  ];

  const traceInvoices: DashboardTraceInvoice[] = [
    { id: "sale-1", title: "Klant Alpha", invoiceNumber: "V-2026-001", invoiceDate: "2026-09-03", documentType: "invoice" },
    { id: "purchase-1", title: "Leverancier Beta", invoiceNumber: "A-2026-017", invoiceDate: "2026-09-02", documentType: "invoice" },
  ];

  if (duplicate === "1") {
    const candidates: DuplicateInvoiceCandidate[] = [
      {
        id: "purchase-1",
        supplier_name: "Leverancier Beta",
        customer_name: null,
        invoice_number: "A-2026-017",
        invoice_date: "2026-09-02",
        total: 242,
        currency: "EUR",
        created_at: "2026-09-02T08:00:00Z",
      },
      {
        id: "purchase-2",
        supplier_name: "Leverancier Beta",
        customer_name: null,
        invoice_number: "A-2026-017",
        invoice_date: "2026-09-02",
        total: 242,
        currency: "EUR",
        created_at: "2026-09-02T09:00:00Z",
        duplicate_resolution: distinct === "1" ? "confirmed_distinct" : null,
      },
    ];
    const duplicateIds = possibleDuplicateInvoiceIds(candidates);

    invoices.push({
      id: "purchase-2",
      invoiceType: "purchase",
      invoiceDate: "2026-09-02",
      currency: "EUR",
      subtotal: 200,
      vatAmount: 42,
      total: 242,
      reviewStatus: "confirmed",
      documentType: "invoice",
      possibleDuplicate: duplicateIds.has("purchase-2"),
    });
    traceInvoices.push({ id: "purchase-2", title: "Leverancier Beta", invoiceNumber: "A-2026-017", invoiceDate: "2026-09-02", documentType: "invoice" });
  }

  if (credit === "1") {
    invoices.push({
      id: "sale-credit-1",
      invoiceType: "sale",
      invoiceDate: "2026-09-04",
      currency: "EUR",
      subtotal: 100,
      vatAmount: 21,
      total: 121,
      reviewStatus: "confirmed",
      documentType: "credit_note",
    });
    traceInvoices.push({ id: "sale-credit-1", title: "Klant Alpha", invoiceNumber: "CN-2026-001", invoiceDate: "2026-09-04", documentType: "credit_note" });
  }

  const summary = calculateDashboardFinancialSummary(invoices, period);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Dashboard test</h1>
      <p data-testid="reliable-count">{summary.reliableInvoiceCount}</p>
      <p data-testid="review-count">{summary.needsReviewCount}</p>
      <p data-testid="summary-status">{summary.status}</p>
      <FinancialOverview summary={summary} traceInvoices={traceInvoices} vatStatus={vatStatus} />
    </main>
  );
}
