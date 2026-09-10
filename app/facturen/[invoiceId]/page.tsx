import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";
import {
  groupPossibleDuplicateInvoices,
  possibleDuplicateInvoiceIds,
  type DuplicateInvoiceCandidate,
} from "@/lib/invoices/duplicate-detection";
import DuplicateResolutionButton from "./duplicate-resolution-button";
import "./source-detail.css";

export const dynamic = "force-dynamic";
const invoicePageSize = 1000;

type InvoiceSourceRow = DuplicateInvoiceCandidate & { company_id: string; document_id: string; due_date: string | null; subtotal: number | null; vat_amount: number | null; description: string | null; invoice_type: string | null; review_status: string; duplicate_resolution: string | null };
type DocumentSourceRow = { id: string; company_id: string; display_name: string | null; original_filename: string; document_type: string | null };

function formatMoney(value: number | null, currency: string | null) { if (value === null) return "Niet betrouwbaar beschikbaar"; if (!currency) return `${Number(value).toFixed(2)} (valuta niet bevestigd)`; try { return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(Number(value)); } catch { return `${Number(value).toFixed(2)} ${currency}`; } }
function statusLabel(status: string, possibleDuplicate: boolean, duplicateLookupFailed: boolean) { if (duplicateLookupFailed) return "Duplicaatcontrole niet beschikbaar - eerst nakijken"; if (possibleDuplicate) return "Mogelijk dubbel - eerst nakijken"; if (status === "confirmed") return "Door jou bevestigd"; if (status === "auto_verified") return "Automatisch in orde"; return "Nog niet betrouwbaar bevestigd"; }
function InvoiceLoadError({ title, text }: { title: string; text: string }) { return <main className="invoice-source-page"><div className="invoice-source-topbar"><Link className="text-button" href="/facturen">← Terug naar facturen</Link></div><section className="card invoice-source-card" role="alert"><div className="eyebrow">Factuur</div><h1>{title}</h1><p className="muted">{text}</p><p>Dit betekent niet dat de factuur verdwenen is. We tonen liever geen onbetrouwbare conclusie.</p><Link className="button secondary" href="/facturen">Facturen opnieuw openen</Link></section></main>; }

export default async function InvoiceSourcePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return <InvoiceLoadError title="We konden je bedrijfscontext niet betrouwbaar controleren" text="Probeer de facturen opnieuw te openen voordat je op deze gegevens vertrouwt." />;
  if (company.state === "no_company") notFound();
  if (company.state === "selection_required") redirect(`/bedrijf-kiezen?returnTo=${encodeURIComponent(`/facturen/${invoiceId}`)}`);
  const companyId = company.companyId;

  const { data: invoiceData, error: invoiceError } = await supabase.from("invoices").select("id, company_id, document_id, supplier_name, customer_name, invoice_number, invoice_date, due_date, currency, subtotal, vat_amount, total, description, invoice_type, review_status, duplicate_resolution, created_at").eq("id", invoiceId).eq("company_id", companyId).maybeSingle();
  if (invoiceError) return <InvoiceLoadError title="We konden deze factuur nu niet betrouwbaar laden" text="Er ging iets mis bij het ophalen van de opgeslagen factuurgegevens." />;
  if (!invoiceData) notFound();
  const invoice = invoiceData as InvoiceSourceRow;

  const { data: documentData, error: documentError } = await supabase.from("documents").select("id, company_id, display_name, original_filename, document_type").eq("id", invoice.document_id).eq("company_id", companyId).maybeSingle();
  const document = documentError ? null : (documentData ?? null) as DocumentSourceRow | null;

  const duplicateCandidates: DuplicateInvoiceCandidate[] = []; let offset = 0; let duplicateLookupFailed = false;
  while (true) {
    const { data, error } = await supabase.from("invoices").select("id, company_id, supplier_name, customer_name, invoice_number, invoice_date, total, currency, duplicate_resolution, created_at").eq("company_id", companyId).order("created_at", { ascending: true }).range(offset, offset + invoicePageSize - 1);
    if (error) { duplicateLookupFailed = true; break; }
    const page = (data ?? []) as DuplicateInvoiceCandidate[]; duplicateCandidates.push(...page); if (page.length < invoicePageSize) break; offset += invoicePageSize;
  }

  const duplicateIds = duplicateLookupFailed ? new Set<string>() : possibleDuplicateInvoiceIds(duplicateCandidates);
  const duplicateGroup = duplicateLookupFailed ? null : groupPossibleDuplicateInvoices(duplicateCandidates).find((group) => group.some((candidate) => candidate.id === invoice.id)) ?? null;
  const possibleDuplicate = duplicateIds.has(invoice.id);
  const duplicateOriginal = duplicateGroup ? [...duplicateGroup].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] ?? null : null;
  const duplicateOthers = duplicateGroup?.filter((candidate) => candidate.id !== invoice.id) ?? [];
  const confirmedDistinct = invoice.duplicate_resolution === "confirmed_distinct";
  const title = invoice.supplier_name ?? invoice.customer_name ?? document?.display_name ?? document?.original_filename ?? "Factuur";
  const statusIsOk = !duplicateLookupFailed && !possibleDuplicate && (invoice.review_status === "confirmed" || invoice.review_status === "auto_verified");

  return <main className="invoice-source-page"><div className="invoice-source-topbar"><Link className="text-button" href="/dashboard">← Terug naar dashboard</Link><Link className="text-button" href="/facturen">Alle facturen</Link></div>
    <section className="card invoice-source-card" aria-labelledby="invoice-source-title"><div className="eyebrow">Bronfactuur</div><div className="invoice-source-heading"><div><h1 id="invoice-source-title">{title}</h1><p className="muted">Hier zie je de opgeslagen gegevens van deze factuur. Alleen facturen die betrouwbaar genoeg zijn, tellen mee in het dashboard.</p></div><span className={`invoice-source-status ${statusIsOk ? "is-ok" : "is-review"}`}>{statusLabel(invoice.review_status, possibleDuplicate, duplicateLookupFailed)}</span></div>
    <p><a className="button secondary" href={`/api/documents/${invoice.document_id}/open`} target="_blank" rel="noreferrer">Open origineel document</a></p>
    {duplicateLookupFailed ? <div className="invoice-source-note is-warning" role="alert"><strong>We konden mogelijke dubbele facturen nu niet betrouwbaar controleren.</strong><p>Ga er daarom niet van uit dat deze factuur uniek is. De opgeslagen factuurgegevens blijven zichtbaar, maar de status wordt bewust niet als volledig in orde getoond zolang deze controle technisch niet gelukt is.</p><p>Open het originele document en probeer deze pagina later opnieuw voordat je een mogelijke dubbele upload uitsluit.</p></div> : null}
    {documentError ? <div className="invoice-source-note is-warning" role="status"><strong>De extra documentgegevens konden nu niet betrouwbaar geladen worden.</strong><p>De factuurgegevens hierboven komen nog wel uit de opgeslagen factuur. Gebruik het originele document als bron wanneer je iets wilt controleren.</p></div> : null}
    {possibleDuplicate && duplicateOriginal ? <div className="invoice-source-note is-warning" role="status"><strong>Deze factuur lijkt mogelijk dubbel.</strong><p>We vonden dezelfde partij, hetzelfde factuurnummer, dezelfde datum, dezelfde valuta en hetzelfde totaal bij een oudere upload. Daarom telt deze versie voorlopig niet mee in je dashboard. We verwijderen niets automatisch.</p><p><Link className="text-button" href={`/facturen/${duplicateOriginal.id}`}>Bekijk de eerdere factuur</Link></p><p>Vergelijk de originele documenten eerst. Alleen als dit werkelijk een andere factuur is, bevestig je dat hieronder. Deze keuze verwijdert alleen de duplicaatblokkering. Een factuur die verder nog niet betrouwbaar bevestigd is, telt daardoor niet automatisch mee.</p><DuplicateResolutionButton invoiceId={invoice.id} distinct /></div> : confirmedDistinct ? <div className="invoice-source-note" role="status"><strong>Door jou bevestigd als aparte factuur.</strong><p>Je hebt eerder bevestigd dat dit geen dubbele upload is. Daarom blokkeert het duplicaatsignaal deze factuur niet meer. De gewone factuurcontrole blijft wel van toepassing.</p><DuplicateResolutionButton invoiceId={invoice.id} distinct={false} /></div> : duplicateOthers.length > 0 ? <div className="invoice-source-note is-warning" role="status"><strong>We vonden ook {duplicateOthers.length === 1 ? "een latere factuur" : `${duplicateOthers.length} latere facturen`} met dezelfde kerngegevens.</strong><p>Deze oudere versie blijft voorlopig de referentie. Open het latere mogelijke duplicaat om de documenten te vergelijken en, alleen als het echt een aparte factuur is, dat daar expliciet te bevestigen.</p><p><Link className="text-button" href={`/facturen/${duplicateOthers[0].id}`}>Bekijk {duplicateOthers.length === 1 ? "de andere factuur" : "een mogelijk duplicaat"}</Link></p></div> : null}
    <div className="invoice-source-grid"><div><span>Document</span><strong>{document?.document_type === "credit_note" ? "Creditnota" : "Factuur"}</strong></div><div><span>Factuurnummer</span><strong>{invoice.invoice_number ?? "Niet betrouwbaar gevonden"}</strong></div><div><span>Factuurdatum</span><strong>{invoice.invoice_date ?? "Niet betrouwbaar gevonden"}</strong></div><div><span>Vervaldatum</span><strong>{invoice.due_date ?? "Niet betrouwbaar gevonden"}</strong></div><div><span>Aankoop of verkoop</span><strong>{invoice.invoice_type === "purchase" ? "Aankoop" : invoice.invoice_type === "sale" ? "Verkoop" : "Niet zeker"}</strong></div><div><span>Bedrag zonder btw</span><strong>{formatMoney(invoice.subtotal, invoice.currency)}</strong></div><div><span>Btw</span><strong>{formatMoney(invoice.vat_amount, invoice.currency)}</strong></div><div><span>Totaal</span><strong>{formatMoney(invoice.total, invoice.currency)}</strong></div></div>
    {invoice.description ? <div className="invoice-source-description"><span>Omschrijving</span><p>{invoice.description}</p></div> : null}
    <div className="invoice-source-note"><strong>Waarom zie ik deze pagina?</strong><p>Deze pagina toont de opgeslagen brongegevens achter deze factuur. Zo kan je altijd controleren wat de app gelezen heeft en waarom een factuur wel of niet betrouwbaar in je financieel overzicht kan worden gebruikt.</p></div></section></main>;
}
