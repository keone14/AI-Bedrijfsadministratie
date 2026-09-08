import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DocumentUpload from "./document-upload";
import "./documenten.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SEARCH_BATCH_SIZE = 1000;
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
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
};

type PageState = "ready" | "no_company" | "multiple_companies" | "error";

type DocumentsResult = {
  state: PageState;
  documents: DocumentRow[];
  invoiceLinks: Map<string, InvoiceLinkRow>;
  total: number;
  archiveTotal: number;
  page: number;
  totalPages: number;
  query: string;
};

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

function searchDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${value} ${new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric" }).format(date)}`;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-BE");
}

function safeQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function safePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/documenten?${suffix}` : "/documenten";
}

function matchesQuery(document: DocumentRow, invoice: InvoiceLinkRow | undefined, query: string) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;

  const total = invoice?.total === null || invoice?.total === undefined
    ? ""
    : `${invoice.total} ${Number(invoice.total).toLocaleString("nl-BE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const haystack = normalizeSearchText([
    document.display_name,
    document.original_filename,
    documentTypeLabel(document.document_type),
    searchDate(document.detected_date ?? document.created_at),
    invoice?.supplier_name,
    invoice?.customer_name,
    invoice?.invoice_number,
    searchDate(invoice?.invoice_date ?? null),
    total,
    invoice?.currency,
  ].filter(Boolean).join(" "));

  return tokens.every((token) => haystack.includes(token));
}

async function loadAllDocuments(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, companyId: string) {
  const documents: DocumentRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, original_filename, display_name, document_type, processing_status, review_status, detected_date, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + SEARCH_BATCH_SIZE - 1);
    if (error) return { documents: [] as DocumentRow[], error: true };
    const batch = (data ?? []) as DocumentRow[];
    documents.push(...batch);
    if (batch.length < SEARCH_BATCH_SIZE) break;
    offset += SEARCH_BATCH_SIZE;
  }

  return { documents, error: false };
}

async function loadAllInvoiceLinks(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, companyId: string) {
  const invoiceLinks = new Map<string, InvoiceLinkRow>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, document_id, supplier_name, customer_name, invoice_number, invoice_date, total, currency")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + SEARCH_BATCH_SIZE - 1);
    if (error) return { invoiceLinks: new Map<string, InvoiceLinkRow>(), error: true };
    const batch = (data ?? []) as InvoiceLinkRow[];
    for (const invoice of batch) invoiceLinks.set(invoice.document_id, invoice);
    if (batch.length < SEARCH_BATCH_SIZE) break;
    offset += SEARCH_BATCH_SIZE;
  }

  return { invoiceLinks, error: false };
}

async function loadDocuments(requestedPage: number, query: string): Promise<DocumentsResult> {
  const empty = (state: PageState): DocumentsResult => ({ state, documents: [], invoiceLinks: new Map(), total: 0, archiveTotal: 0, page: 1, totalPages: 1, query });

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

    if (membershipError) return empty("error");
    if (!memberships?.length) return empty("no_company");
    if (memberships.length > 1) return empty("multiple_companies");

    const companyId = memberships[0].company_id as string;

    if (query) {
      const [documentResult, invoiceResult] = await Promise.all([
        loadAllDocuments(supabase, companyId),
        loadAllInvoiceLinks(supabase, companyId),
      ]);
      if (documentResult.error || invoiceResult.error) return empty("error");

      const filtered = documentResult.documents.filter((document) => matchesQuery(document, invoiceResult.invoiceLinks.get(document.id), query));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(requestedPage, totalPages);
      const from = (page - 1) * PAGE_SIZE;
      const documents = filtered.slice(from, from + PAGE_SIZE);
      const invoiceLinks = new Map<string, InvoiceLinkRow>();
      for (const document of documents) {
        const invoice = invoiceResult.invoiceLinks.get(document.id);
        if (invoice) invoiceLinks.set(document.id, invoice);
      }

      return { state: "ready", documents, invoiceLinks, total, archiveTotal: documentResult.documents.length, page, totalPages, query };
    }

    const { count, error: countError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    if (countError) return empty("error");

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .select("id, original_filename, display_name, document_type, processing_status, review_status, detected_date, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (documentError) return empty("error");
    const documents = (documentData ?? []) as DocumentRow[];
    const documentIds = documents.map((document) => document.id);
    const invoiceLinks = new Map<string, InvoiceLinkRow>();

    if (documentIds.length) {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, document_id, supplier_name, customer_name, invoice_number, invoice_date, total, currency")
        .eq("company_id", companyId)
        .in("document_id", documentIds);
      if (invoiceError) return empty("error");
      for (const invoice of (invoiceData ?? []) as InvoiceLinkRow[]) invoiceLinks.set(invoice.document_id, invoice);
    }

    return { state: "ready", documents, invoiceLinks, total, archiveTotal: total, page, totalPages, query };
  } catch {
    return empty("error");
  }
}

export default async function DocumentenPage({ searchParams }: { searchParams: Promise<{ page?: string | string[]; q?: string | string[] }> }) {
  const params = await searchParams;
  const query = safeQuery(params.q);
  const data = await loadDocuments(safePage(params.page), query);

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
            <p className="muted">Facturen verschijnen hier automatisch. Contracten, attesten en andere bedrijfsdocumenten kun je nu ook rechtstreeks toevoegen zonder zelf mappen te beheren.</p>
          </div>
          <Link className="button secondary" href="/facturen">Naar facturen</Link>
        </header>

        {stateMessage ? (
          <section className="card documents-state" role="status">
            <h2>{stateMessage.title}</h2>
            <p className="muted">{stateMessage.text}</p>
            <Link className="button secondary" href="/onboarding">Bedrijfsgegevens bekijken</Link>
          </section>
        ) : (
          <>
            <DocumentUpload />

            {data.archiveTotal > 0 ? (
              <section className="card documents-search-card" aria-labelledby="documents-search-title">
                <form className="documents-search" action="/documenten" method="get">
                  <label id="documents-search-title" htmlFor="documents-query">Zoek in je documenten</label>
                  <div className="documents-search-row">
                    <input id="documents-query" name="q" type="search" defaultValue={data.query} maxLength={80} autoComplete="off" placeholder="bv. Meta augustus, factuur 2026-014 of 125,50" />
                    <button className="button" type="submit">Zoeken</button>
                    {data.query ? <Link className="button secondary" href="/documenten">Wis zoekopdracht</Link> : null}
                  </div>
                  <p className="muted">Zoekt in opgeslagen naam, bestandsnaam, type, factuurnummer, leverancier of klant, datum en bedrag. Er wordt geen betaalde AI-zoekdienst gebruikt.</p>
                </form>
              </section>
            ) : null}

            {data.documents.length ? (
              <>
                <section className="documents-summary" aria-label="Documentoverzicht">
                  <div className="card"><span className="documents-summary-label">Opgeslagen</span><strong>{data.archiveTotal}</strong><p className="muted">originele documenten</p></div>
                  <div className="card"><span className="documents-summary-label">{data.query ? "Gevonden" : "Deze pagina"}</span><strong>{data.query ? data.total : data.documents.length}</strong><p className="muted">{data.query ? `voor “${data.query}”` : `van maximaal ${PAGE_SIZE} documenten`}</p></div>
                  <div className="card"><span className="documents-summary-label">Pagina</span><strong>{data.page}</strong><p className="muted">van {data.totalPages}</p></div>
                </section>

                <section className="card documents-list-card" aria-labelledby="documents-list-title">
                  <div className="documents-list-heading">
                    <div><h2 id="documents-list-title">{data.query ? "Zoekresultaten" : "Alle opgeslagen documenten"}</h2><p className="muted">Nieuwste eerst. Het originele bestand blijft apart van wat later uit het document wordt gelezen.</p></div>
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
                  {data.totalPages > 1 ? (
                    <nav className="documents-pagination" aria-label="Documentpagina's">
                      <span>Documenten {((data.page - 1) * PAGE_SIZE) + 1}-{Math.min(data.page * PAGE_SIZE, data.total)} van {data.total}</span>
                      <div>
                        {data.page > 1 ? <Link className="button secondary" href={pageHref(data.page - 1, data.query)}>Vorige</Link> : <span className="button secondary is-disabled" aria-disabled="true">Vorige</span>}
                        {data.page < data.totalPages ? <Link className="button secondary" href={pageHref(data.page + 1, data.query)}>Volgende</Link> : <span className="button secondary is-disabled" aria-disabled="true">Volgende</span>}
                      </div>
                    </nav>
                  ) : null}
                </section>
              </>
            ) : data.query && data.archiveTotal > 0 ? (
              <section className="card documents-state" role="status">
                <h2>Geen documenten gevonden voor “{data.query}”</h2>
                <p className="muted">Probeer een leverancier, klant, factuurnummer, maand, jaar, documenttype of bedrag. We gokken niet op resultaten die niet in je opgeslagen gegevens staan.</p>
                <Link className="button secondary" href="/documenten">Toon alle documenten</Link>
              </section>
            ) : (
              <section className="card documents-state">
                <h2>Nog geen documenten opgeslagen</h2>
                <p className="muted">Voeg hierboven een contract, attest, brief of ander bedrijfsdocument toe. Facturen kun je via Facturen uploaden en verschijnen daarna automatisch ook hier.</p>
                <Link className="button secondary" href="/facturen">Factuur toevoegen</Link>
              </section>
            )}
          </>
        )}

        <section className="card documents-safety">
          <strong>Wat deze kluis nu veilig doet</strong>
          <p className="muted">Originele bestanden blijven privé en worden niet overschreven. Een algemene upload krijgt bewust geen definitief documenttype zolang dat niet betrouwbaar is vastgesteld. Automatische classificatie voegen we pas toe wanneer twijfel zichtbaar en controleerbaar blijft.</p>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">
        <Link href="/dashboard">Home</Link><Link href="/facturen">Facturen</Link><Link className="active" href="/documenten">Documenten</Link><Link href="/onboarding">Bedrijf</Link><span aria-disabled="true">Deadlines</span>
      </nav>
    </div>
  );
}
