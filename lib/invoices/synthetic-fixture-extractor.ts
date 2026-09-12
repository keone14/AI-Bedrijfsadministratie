import "server-only";
import type { InvoiceExtraction } from "./extraction-schema";

/**
 * Development/staging-only fixture used to prove the extraction pipeline without
 * sending customer documents to an external provider or creating AI API costs.
 * It intentionally ignores document bytes and must never be enabled in production.
 */
export function extractSyntheticInvoiceFixture(): InvoiceExtraction {
  return {
    documentType: { value: "invoice", confidence: 0.99 },
    supplierName: { value: "Voorbeeld Leverancier BV", confidence: 0.98 },
    customerName: { value: "Voorbeeld Bedrijf", confidence: 0.96 },
    invoiceNumber: { value: "TEST-2026-0001", confidence: 0.99 },
    invoiceDate: { value: "2026-09-02", confidence: 0.99 },
    dueDate: { value: "2026-10-02", confidence: 0.95 },
    subtotal: { value: 100, confidence: 0.99 },
    vatAmount: { value: 21, confidence: 0.99 },
    total: { value: 121, confidence: 0.99 },
    currency: { value: "EUR", confidence: 0.99 },
    description: { value: "Synthetische testdienst", confidence: 0.95 },
    invoiceType: { value: "purchase", confidence: 0.97 },
  };
}
