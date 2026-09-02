import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "Niet zeker / niet gevonden";
  if (!currency) return `${value.toFixed(2)} (valuta niet bevestigd)`;
  try {
    return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function statusLabel(job: JobRow | undefined, document: DocumentRow | undefined) {
  if (job?.status === "processing") return "Wordt gelezen...";
  if (job?.status === "failed") return "Kon niet volledig gelezen worden";
  if (job?.status === "needs_review") return "Controle nodig";
  if (job?.status === "completed") return "In orde";
  if (document?.processing_status === "needs_review") return "Controle nodig";
  return "Klaar voor uitlezen";
}

export default async function InvoiceList() {
  const supabase = await createSupabaseServerClient();
  const { data: invoiceData } = await supabase
    .from("invoices")
    .select("id, supplier_name, customer_name, invoice_number, invoice_date, due_date, currency, subtotal, vat_amount, total, description, invoice_type, review_status, created_at, document_id")
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
  const [{ data: jobData }, { data: documentData }] = await Promise.all([
    supabase.from("invoice_processing_jobs").select("invoice_id, status, error_code").in("invoice_id", invoiceIds),
    supabase.from("documents").select("id, display_name, original_filename, processing_status").in("id", documentIds),
  ]);

  const jobs = new Map(((jobData ?? []) as JobRow[]).map((job) => [job.invoice_id, job]));
  const documents = new Map(((documentData ?? []) as DocumentRow[]).map((document) => [document.id, document]));

  return (
    <section className="invoice-list-section" aria-labelledby="invoice-list-title">
      <div className="section-intro">
        <div>
          <div className="eyebrow">Jouw facturen</div>
          <h2 id="invoice-list-title">Wat de app momenteel echt weet</h2>
        </div>
        <p className="muted">Niet gevonden of onzekere velden blijven zichtbaar als onbekend. Een AI-resultaat wordt in deze fase nooit automatisch als definitief goedgekeurd.</p>
      </div>

      <div className="invoice-card-list">
        {invoices.map((invoice) => {
          const job = jobs.get(invoice.id);
          const document = documents.get(invoice.document_id);
          const label = statusLabel(job, document);
          const hasExtraction = Boolean(job?.status === "needs_review" || invoice.supplier_name || invoice.customer_name || invoice.total !== null);

          return (
            <article className="card invoice-record-card" key={invoice.id}>
              <div className="invoice-record-heading">
                <div>
                  <strong>{invoice.supplier_name ?? invoice.customer_name ?? document?.display_name ?? document?.original_filename ?? "Factuur"}</strong>
                  <span>{document?.display_name ?? document?.original_filename ?? "Origineel document"}</span>
                </div>
                <span className={`invoice-state ${job?.status === "failed" ? "is-error" : job?.status === "processing" ? "is-processing" : "is-review"}`}>{label}</span>
              </div>

              {job?.status === "failed" ? (
                <div className="invoice-read-warning" role="status">
                  <strong>De uitlezing is niet betrouwbaar afgerond.</strong>
                  <span>Je originele factuur blijft veilig bewaard. We tonen geen verzonnen gegevens.</span>
                </div>
              ) : hasExtraction ? (
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
