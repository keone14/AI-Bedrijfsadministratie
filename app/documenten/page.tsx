import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./documenten.css";

export const dynamic = "force-dynamic";

const nav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Facturen", href: "/facturen" },
  { label: "Documenten", href: "/documenten", active: true },
  { label: "Deadlines", href: null },
  { label: "Assistent", href: null },
  { label: "Bedrijf", href: "/onboarding" },
];

type DocumentRow = {
  id: string;
  original_filename: string;
  display_name: string | null;
  document_type: string | null;
  processing_status: string | null;
  review_status: string | null;
  detected_date: string | null;
  created_at: string;
};

type InvoiceLinkRow = {
  id: string;
  document_id: string;
  supplier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
};

type PageState = "ready" | "no_company" | "multiple_companies" | "error";

function documentTypeLabel(type: string | null) {
  if (type === "invoice") return "Factuur";
  if (type === "credit_note") return "Creditnota";
  if (!type) return "Type nog niet bevestigd";
  return "Ander document";
}

function documentStatus(document: DocumentRow) {
  if (document.processing_status === "processing") return "Wordt verwerkt";
  if (document.processing_status === "failed") return "Kon niet volledig worden verwerkt";
  if (document.review_status === "needs_review") return "Nog nakijken";
  if (document.review_status === "confirmed" || document.review_status === "auto_verified") return "In orde";
  return "Opgeslagen";
}

function formatDate(value: string | null, fallback: string) {
  const source = value ?? fallback;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "Datum niet betrouwbaar gevonden";
  return new Intl.DateTimeFormat("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

async function loadDocuments(): Promise<{ state: PageState; documents: DocumentRow[]; invoiceLinks: Map<string, InvoiceLinkRow> }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: memberships, error: membershipError } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(2);

    if (membershipError) return { state: "error", documents: [], invoiceLinks: new Map() };
    if (!memberships?.length) return { state: "no_company", documents: [], invoiceLinks: new Map() };
    if (memberships.length > 1) return { state: "multiple_companies", documents: [], invoiceLinks: new Map() };

    const companyId = memberships[0].company_id as string;
    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .select("id, original_filename, display_name, document_type, processing_status, review_status, detected_date, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (documentError) return { state: "error", documents: [], invoiceLinks: new Map() };
    const documents = (documentData ?? []) as DocumentRow[];
    const documentIds = documents.map((document) => document.id);
    const invoiceLinks = new Map<string, InvoiceLinkRow>();

    if (documentIds.length) {
      const batchSize = 200;
      for (let index = 0; index < documentIds.length; index += batchSize) {
        const batch = documentIds.slice(index, index + batchSize);
        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .select("id, document_id, supplier_name, customer_name, invoice_number")
          .eq("company_id", companyId)
          .in("document_id", batch);
        if (invoiceError) return { state: "error", documents: [], invoiceLinks: new Map() };
        for (const invoice of (invoiceData ?? []) as InvoiceLinkRow[]) invoiceLinks.set(invoice.document_id, invoice);
      }
    }

    return { state: "ready", documents, invoiceLinks };
  } catch {
    return { state: "error", documents: [], invoiceLinks: new Map() };
  }
}

export default async function DocumentenPage() {
  const data = await loadDocuments();

  const stateMessage = data.state === "multiple_companies"
    ? { title: "Kies eerst welk bedrijf je wilt bekijken", text: "We tonen nooit documenten van meerdere bedrijven door elkaar. Ga naar Bedrijf om je bedrijfscontext te controleren." }
    : data.state === "no_company"
      ? { title: "Stel eerst je bedrijf in", text: "Daarna kunnen opgeslagen documenten veilig aan één bedrijf gekoppeld worden." }
      : data.state === "error"
        ? { title: "We konden je documenten nu niet betrouwbaar laden", text: "We tonen liever niets dan documenten uit een onzekere bedrijfscontext." }
        : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Bedrijfsadministratie</div>
        <nav className="nav" aria-label="Hoofdnavigatie">
          {nav.map((item) => item.href ? (
            <Link key={item.label} className={item.active ? "active" : ""} href={item.href}>{item.label}</Link>
          ) : (
            <span key={item.label} className="nav-disabled" aria-disabled="true">{item.label}<small>Nog niet beschikbaar</small></span>
          ))}
        </nav>
      </aside>

      <main className="main documents-main">
        <header className="documents-heading">
          <div>
            <div className="eyebrow">Documenten</div>
            <h1>Je originele documenten op één veilige plek.</h1>
            <p className="muted">Facturen die je al uploadde verschijnen hier automatisch. Je hoeft niets opnieuw te uploaden of zelf in mappen te zetten.</p>
          </div>
          <Link className="button" href="/facturen">Factuur toevoegen</Link>
        </header>

        {stateMessage ? (
          <section className="card documents-state" role="status">
            <h2>{stateMessage.title}</h2>
            <p className="muted">{stateMessage.text}</p>
            <Link className="button secondary" href="/onboarding">Bedrijfsgegevens bekijken</Link>
          </section>
        ) : data.documents.length ? (
          <>
            <section className="documents-summary" aria-label="Documentoverzicht">
              <div className="card"><span className="documents-summary-label">Opgeslagen</span><strong>{data.documents.length}</strong><p className="muted">originele documenten</p></div>
              <div className="card"><span className="documents-summary-label">Facturen</span><strong>{data.documents.filter((document) => document.document_type === "invoice").length}</strong><p className="muted">automatisch terug te vinden</p></div>
              <div className="card"><span className="documents-summary-label">Nakijken</span><strong>{data.documents.filter((document) => document.review_status === "needs_review" || document.processing_status === "failed").length}</strong><p className="muted">documenten met aandacht</p></div>
            </section>

            <section className="card documents-list-card" aria-labelledby="documents-list-title">
              <div className="documents-list-heading">
                <div><h2 id="documents-list-title">Alle opgeslagen documenten</h2><p className="muted">Nieuwste eerst. Het originele bestand blijft apart van wat AI eruit leest.</p></div>
              </div>
              <div className="documents-list">
                {data.documents.map((document) => {
                  const invoice = data.invoiceLinks.get(document.id);
                  const title = invoice?.supplier_name ?? invoice?.customer_name ?? document.display_name ?? document.original_filename;
                  return (
                    <article className="document-row" key={document.id}>
                      <div className="document-row-main">
                        <div className="document-icon" aria-hidden="true">DOC</div>
                        <div className="document-copy">
                          <strong>{title}</strong>
                          <span>{documentTypeLabel(document.document_type)} · {formatDate(document.detected_date, document.created_at)}</span>
                          {invoice?.invoice_number ? <span>Nummer {invoice.invoice_number}</span> : <span>{document.original_filename}</span>}
                        </div>
                      </div>
                      <div className="document-row-side">
                        <span className={`document-status ${document.review_status === "needs_review" || document.processing_status === "failed" ? "is-review" : ""}`}>{documentStatus(document)}</span>
                        <div className="document-actions">
                          <a className="button secondary" href={`/api/documents/${document.id}/open`} target="_blank" rel="noreferrer">Open origineel</a>
                          {invoice ? <Link className="text-button" href={`/facturen/${invoice.id}`}>Bekijk factuurgegevens</Link> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {data.documents.length === 500 ? <p className="documents-limit-note">Je hebt minstens 500 documenten. Deze eerste versie toont de 500 nieuwste zodat de pagina snel blijft. Er wordt niets verwijderd.</p> : null}
            </section>
          </>
        ) : (
          <section className="card documents-state">
            <h2>Nog geen documenten opgeslagen</h2>
            <p className="muted">Upload je eerste factuur. Het originele bestand verschijnt daarna automatisch ook hier.</p>
            <Link className="button" href="/facturen">Eerste factuur toevoegen</Link>
          </section>
        )}

        <section className="card documents-safety">
          <strong>Wat deze kluis nu wel en niet doet</strong>
          <p className="muted">Je bestaande originele facturen zijn hier terug te vinden zonder dubbele upload. Andere documenttypes, automatische documentclassificatie en algemene documentupload bouwen we pas wanneer die flow even veilig en controleerbaar is als de huidige factuurupload.</p>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">
        <Link href="/dashboard">Home</Link><Link href="/facturen">Facturen</Link><Link className="active" href="/documenten">Documenten</Link><Link href="/onboarding">Bedrijf</Link><span aria-disabled="true">Deadlines</span>
      </nav>
    </div>
  );
}
