import InvoiceExtractionRetry from "@/app/facturen/invoice-extraction-retry";

export default function ExtractionRetryFixturePage() {
  return (
    <main style={{ padding: 24 }}>
      <InvoiceExtractionRetry invoiceId="invoice-rate-limit-test" />
    </main>
  );
}
