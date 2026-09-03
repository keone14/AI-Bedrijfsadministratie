import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./source-detail.css";

export const dynamic = "force-dynamic";

type InvoiceSourceRow = {
  id: string;
  company_id: string;
  document_id: string;
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
};

type DocumentSourceRow = {
  id: string;
  company_id: string;
  display_name: string | null;
  original_filename: string;
  document_type: string | null;
};

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "Niet betrouwbaar beschikbaar";
  if (!currency) return `${Number(value).toFixed(2)} (valuta niet bevestigd)`;
  try {
    return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Door jou bevestigd";
  if (status === "auto_verified") return "Automatisch in orde";
  return "Nog niet betrouwbaar bevestigd";
}

export default async function InvoiceSourcePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError || !memberships?.length) notFound();
  const companyIds = memberships.map((membership) => membership.company_id as string);

  const { data: invoiceData, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, company_id, document_id, supplier_name, customer_name, invoice_number, invoice_date, due_date, currency, subtotal, vat_amount, total, description, invoice_type, review_status")
    .eq("id", invoiceId)
    .in("company_id", companyIds)
    .maybeSingle();

  if (invoiceError || !invoiceData) notFound();
  const invoice = invoiceData as InvoiceSourceRow;

  const { data: documentData } = await supabase
    .from("documents")
    .select("id, company_id, display_name, original_filename, document_type")
    .eq("id", invoice.document_id)
    .eq("company_id", invoice.company_id)
    .maybeSingle();
  const document = (documentData ?? null) as DocumentSourceRow | null;

  const title = invoice.supplier_name ?? invoice.customer_name ?? document?.display_name ?? document?.original_filename ?? "Factuur";

  return (
    <main className="invoice-source-page">
      <div className="invoice-source-topbar">
        <Link className="text-button" href="/dashboard">← Terug naar dashboard</Link>
        <Link className="text-button" href="/facturen">Alle facturen</Link>
      </div>

      <section className="card invoice-source-card" aria-labelledby="invoice-source-title">
        <div className="eyebrow">Bronfactuur</div>
        <div className="invoice-source-heading">
          <div>
            <h1 id="invoice-source-title">{title}</h1>
            <p className="muted">Dit is de factuur waarnaar je dashboardberekening verwijst. De bedragen hieronder komen uit de opgeslagen factuurgegevens, niet uit een nieuwe AI-berekening.</p>
          </div>
          <span className={`invoice-source-status ${invoice.review_status === "confirmed" || invoice.review_status === "auto_verified" ? "is-ok" : "is-review"}`}>{statusLabel(invoice.review_status)}</span>
        </div>

        <div className="invoice-source-grid">
          <div><span>Document</span><strong>{document?.document_type === "credit_note" ? "Creditnota" : "Factuur"}</strong></div>
          <div><span>Factuurnummer</span><strong>{invoice.invoice_number ?? "Niet betrouwbaar gevonden"}</strong></div>
          <div><span>Factuurdatum</span><strong>{invoice.invoice_date ?? "Niet betrouwbaar gevonden"}</strong></div>
          <div><span>Vervaldatum</span><strong>{invoice.due_date ?? "Niet betrouwbaar gevonden"}</strong></div>
          <div><span>Aankoop of verkoop</span><strong>{invoice.invoice_type === "purchase" ? "Aankoop" : invoice.invoice_type === "sale" ? "Verkoop" : "Niet zeker"}</strong></div>
          <div><span>Bedrag zonder btw</span><strong>{formatMoney(invoice.subtotal, invoice.currency)}</strong></div>
          <div><span>Btw</span><strong>{formatMoney(invoice.vat_amount, invoice.currency)}</strong></div>
          <div><span>Totaal</span><strong>{formatMoney(invoice.total, invoice.currency)}</strong></div>
        </div>

        {invoice.description ? <div className="invoice-source-description"><span>Omschrijving</span><p>{invoice.description}</p></div> : null}

        <div className="invoice-source-note">
          <strong>Waarom zie ik deze pagina?</strong>
          <p>Je klikte vanuit een dashboardbedrag door naar één van de facturen die dat bedrag vormt. Ga terug naar het dashboard om de bijdrage van deze factuur in de volledige berekening te zien.</p>
        </div>
      </section>
    </main>
  );
}
