import { notFound } from "next/navigation";
import FinancialOverview from "../dashboard/financial-overview";
import "../dashboard/dashboard.css";
import {
  calculateDashboardFinancialSummary,
  type DashboardInvoice,
  type DashboardPeriod,
} from "@/lib/dashboard/financial-summary";

export const dynamic = "force-dynamic";

const period: DashboardPeriod = {
  start: "2026-09-01",
  endExclusive: "2026-10-01",
  label: "september 2026",
};

export default async function DashboardE2EFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; mixed?: string }>;
}) {
  if (process.env.E2E_TEST_MODE !== "1") notFound();
  const { confirmed, mixed } = await searchParams;

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
      currency: mixed === "1" ? "USD" : "EUR",
      subtotal: 200,
      vatAmount: 42,
      total: 242,
      reviewStatus: "confirmed",
      documentType: "invoice",
    },
  ];

  const summary = calculateDashboardFinancialSummary(invoices, period);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Dashboard test</h1>
      <p data-testid="reliable-count">{summary.reliableInvoiceCount}</p>
      <p data-testid="summary-status">{summary.status}</p>
      <FinancialOverview summary={summary} />
    </main>
  );
}
