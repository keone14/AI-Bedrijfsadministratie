import { createSupabaseServerClient } from "@/lib/supabase/server";
import InvoiceReviewActions from "./invoice-review-actions";

type InvoiceRow = {
  id: string;
  supplier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  description: string | null;
  invoice_type: string | null;
  review_status: string;
  extraction_confidence: number | null;
  approved_at: string | null;
  created_at: string;
  document_id: string;
};

type JobRow = {
  invoice_id: string;
  status: string;
  error_code: string | null;
};

type DocumentRow = {
  id: string;
  display_name: string | null;
  original_filename: string;
  processing_status: string;
};

type ExtractionRow = {
  invoice_id: string;
  field_name: string;
  confidence: number;
  proposed_value_json: unknown;
  user_confirmed: boolean;
};

const fieldLabels: Record<string, string> = {
  documentType: "Documenttype",
  supplierName: "Leverancier",
  customerName: "Klant",
  invoiceNumber: "Factuurnummer",
  invoiceDate: "Factuurdatum",
  dueDate: "Vervaldatum",
  subtotal: "Bedrag zonder btw",
  vatAmount: "Btw",
  total: "Totaal",
  currency: "Valuta",
  description: "Omschrijving",
  invoiceType: "Aankoop of verkoop",
};

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "Niet zeker / niet gevonden";
  if (!currency) return `${value.toFixed(2)} (valuta niet bevestigd)`;
  try {
    return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function statusLabel(invoice: InvoiceRow, job: JobRow | undefined, document: DocumentRow | undefined) {
  if (job?.status === "processing") return "Wordt gelezen...";
  if (job?.status === "failed") return "Kon niet volledig gelezen worden";
  if (invoice.review_status === "confirmed") return "Door jou bevestigd";
  if (invoice.review_status === "auto_verified") return "Automatisch in orde";
  if (job?.status === "needs_review") return "Controle nodig";
  if (document?.processing_status === "needs_review") return "Controle nodig";
  return "Klaar voor uitlezen";
}

function confidenceCopy(value: number | null) {
  if (value === null) return "Nog geen betrouwbare zekerheidsscore beschikbaar.";
  if (value >= 0.95) return "De kernvelden zijn met hoge zekerheid gelezen en de vaste controles zijn geslaagd.";
  if (value >= 0.8) return "De meeste kernvelden lijken duidelijk, maar minstens één belangrijk gegeven verdient controle.";
  return "Minstens één belangrijk veld is onvoldoende zeker. Controleer de gemarkeerde gegevens.";
}

function needsAttention(row: ExtractionRow) {
  return row.confidence < 0.9 || row.proposed_value_json === null;
}

export default async function InvoiceList() {
  const supabase = await createSupabaseServerClient();
  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, supplier_name, customer_name, invoice_number, invoice_date, due_date, currency, subtotal, vat_amount, total, description, invoice_type, review_status, extraction_confidence, approved_at, created_at, document_id")
    .order("created_at", { ascending: false })
    .limit(50);

  const invoices = (invoiceData ?? []) as InvoiceRow[];
  if (!invoices.length) {
    return (
      <section className="card invoices-empty-state">
        <div className="empty-icon" aria-hidden="true">↥</div>
        <h2>Nog geen facturen</h2>
        <p className="muted">Upload je eerste PDF, JPG of PNG. Het originele document wordt eerst veilig bewaard. Uitlezing blijft apart en onzekerheid wordt niet verborgen.</p>
      </section>
    );
  }

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const documentIds = invoices.map((invoice) => invoice.document_id);
  const [{ data: jobData }, { data: documentData }, { data: extractionData }] = await Promise.all([
    supabase.from("invoice_processing_jobs").select("invoice_id, status, error_code").in("invoice_id", invoiceIds),
    supabase.from("documents").select("id, display_name, original_filename, processing_status").in("id", documentIds),
    supabase.from("invoice_extractions").select("invoice_id, field_name, confidence, proposed_value_json, user_confirmed").in("invoice_id", invoiceIds),
  ]);

  const jobs = new Map(((jobData ?? []) as JobRow[]).map((job) => [job.invoice_id, job]));
  const documents = new Map(((documentData ?? []) as DocumentRow[]).map((document) => [document.id, document]));
  const extractions = new Map<string, ExtractionRow[]>();
  for (const row of (extractionData ?? []) as ExtractionRow[]) {
    const current = extractions.get(row.invoice_id) ?? [];
    current.push(row);
    extractions.set(row.invoice_id, current);
  }

  return (
    <section className="invoice-list-section" aria-labelledby="invoice-list-title">
      <div className="section-intro">
        <div>
          <div className="eyebrow">Jouw facturen</div>
          <h2 id="invoice-list-title">Alleen controleren waar dat echt nodig is</h2>
        </div>
        <p className="muted">De app gebruikt een conservatieve confidence-regel. Hoge zekerheid plus geslaagde vaste controles kan automatisch in orde zijn. Bij twijfel tonen we precies welke velden je moet nakijken.</p>
      </div>

      <div className="invoice-card-list">
        {invoices.map((invoice) => {
          const job = jobs.get(invoice.id);
          const document = documents.get(invoice.document_id);
          const rows = extractions.get(invoice.id) ?? [];
          const uncertainFields = rows.filter(needsAttention);
          const label = statusLabel(invoice, job, document);
          const hasExtraction = rows.length > 0 || Boolean(invoice.supplier_name || invoice.customer_name || invoice.total !== null);
          const isConfirmed = invoice.review_status === "confirmed";
          const isAutoVerified = invoice.review_status === "auto_verified";
          const requiresReview = job?.status === "needs_review" && !isConfirmed;

          return (
            <article className="card invoice-record-card" key={invoice.id}>
              <div className="invoice-record-heading">
                <div>
                  <strong>{invoice.supplier_name ?? invoice.customer_name ?? document?.display_name ?? document?.original_filename ?? "Factuur"}</strong>
                  <span>{document?.display_name ?? document?.original_filename ?? "Origineel document"}</span>
                </div>
                <span className={`invoice-state ${job?.status === "failed" ? "is-error" : job?.status === "processing" ? "is-processing" : isConfirmed || isAutoVerified ? "is-ok" : "is-review"}`}>{label}</span>
              </div>

              {job?.status === "failed" ? (
                <div className="invoice-read-warning" role="status">
                  <strong>De uitlezing is niet betrouwbaar afgerond.</strong>
                  <span>Je originele factuur blijft veilig bewaard. We tonen geen verzonnen gegevens.</span>
                </div>
              ) : hasExtraction ? (
                <>
                  <div className="invoice-confidence-note">
                    <strong>{isConfirmed ? "Jij hebt deze uitlezing bevestigd." : isAutoVerified ? "De automatische controles zijn geslaagd." : "Deze factuur moet nog even nagekeken worden."}</strong>
                    <span>{isConfirmed ? "De bevestiging en het tijdstip worden als auditspoor bewaard." : confidenceCopy(invoice.extraction_confidence)}</span>
                  </div>

                  {requiresReview && uncertainFields.length ? (
                    <div className="invoice-uncertain-fields" aria-label="Velden om na te kijken">
                      <strong>Controleer vooral:</strong>
                      <div>
                        {uncertainFields.slice(0, 6).map((row) => (
                          <span key={row.field_name}>{fieldLabels[row.field_name] ?? row.field_name}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="invoice-read-grid">
                    <div><span>Factuurnummer</span><strong>{invoice.invoice_number ?? "Niet zeker / niet gevonden"}</strong></div>
                    <div><span>Datum</span><strong>{invoice.invoice_date ?? "Niet zeker / niet gevonden"}</strong></div>
                    <div><span>Vervaldatum</span><strong>{invoice.due_date ?? "Niet zeker / niet gevonden"}</strong></div>
                    <div><span>Totaal</span><strong>{formatMoney(invoice.total, invoice.currency)}</strong></div>
                    <div><span>Bedrag zonder btw</span><strong>{formatMoney(invoice.subtotal, invoice.currency)}</strong></div>
                    <div><span>Btw</span><strong>{formatMoney(invoice.vat_amount, invoice.currency)}</strong></div>
                    <div><span>Aankoop of verkoop</span><strong>{invoice.invoice_type === "purchase" ? "Aankoop" : invoice.invoice_type === "sale" ? "Verkoop" : "Niet zeker"}</strong></div>
                    <div><span>Omschrijving</span><strong>{invoice.description ?? "Niet zeker / niet gevonden"}</strong></div>
                  </div>

                  {requiresReview ? <InvoiceReviewActions invoiceId={invoice.id} /> : null}
                </>
              ) : (
                <p className="muted invoice-awaiting-copy">Het document is veilig opgeslagen, maar er zijn nog geen betrouwbare uitgelezen velden beschikbaar.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
