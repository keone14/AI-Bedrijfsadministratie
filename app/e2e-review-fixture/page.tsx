import { notFound } from "next/navigation";
import InvoiceReviewActions from "../facturen/invoice-review-actions";
import "../facturen/facturen.css";

export const dynamic = "force-dynamic";

export default async function ReviewE2EFixturePage({ searchParams }: { searchParams: Promise<{ mismatch?: string }> }) {
  if (process.env.E2E_TEST_MODE !== "1") notFound();
  const { mismatch } = await searchParams;
  const total = mismatch === "1" ? 125 : 121;

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Factuur nakijken</h1>
      <InvoiceReviewActions
        invoiceId="e2e-invoice"
        values={{
          documentType: "invoice",
          supplierName: "Voorbeeld Leverancier BV",
          customerName: "Voorbeeld Klant BV",
          invoiceNumber: "INV-2026-009",
          invoiceDate: "2026-09-01",
          dueDate: "2026-09-30",
          subtotal: 100,
          vatAmount: 21,
          total,
          currency: "EUR",
          description: "Software-abonnement",
          invoiceType: "purchase",
          categoryId: "software",
        }}
        categories={[
          { id: "software", simple_label: "Software", description_simple: "Software en digitale abonnementen" },
          { id: "marketing", simple_label: "Reclame & marketing", description_simple: "Advertenties en marketingkosten" },
          { id: "other", simple_label: "Andere", description_simple: "Andere zakelijke kosten" },
        ]}
      />
    </main>
  );
}
