import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";
import { possibleDuplicateInvoiceIds } from "@/lib/invoices/duplicate-detection";
import "./deadlines.css";

export const dynamic = "force-dynamic";

const nav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Facturen", href: "/facturen" },
  { label: "Documenten", href: "/documenten" },
  { label: "Deadlines", href: "/deadlines", active: true },
  { label: "Assistent", href: null },
  { label: "Bedrijf", href: "/onboarding" },
];
const PAGE_SIZE = 1000;

type InvoiceRow = { id: string; company_id: string; supplier_name: string | null; customer_name: string | null; invoice_number: string | null; invoice_type: string | null; invoice_date: string | null; due_date: string | null; total: number | null; currency: string | null; review_status: string; duplicate_resolution: string | null; created_at: string };
type PageState = "ready" | "no_company" | "selection_required" | "error";
type DeadlineAction = { invoice: InvoiceRow; daysLeft: number };
type DeadlinesData = { state: PageState; reviewCount: number; duplicateReviewCount: number; now: DeadlineAction[]; soon: DeadlineAction[]; later: DeadlineAction[] };

function emptyData(state: PageState): DeadlinesData { return { state, reviewCount: 0, duplicateReviewCount: 0, now: [], soon: [], later: [] }; }
function belgianTodayIso() { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function dateOnlyUtc(value: string) { const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); if (!match) return null; const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])); return Number.isFinite(time) ? time : null; }
function differenceInDays(dueDate: string, today: string) { const due = dateOnlyUtc(dueDate); const start = dateOnlyUtc(today); return due === null || start === null ? null : Math.round((due - start) / 86_400_000); }
function formatDate(value: string) { const date = new Date(`${value.slice(0, 10)}T12:00:00Z`); if (Number.isNaN(date.getTime())) return "Datum niet betrouwbaar"; return new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long", year: "numeric" }).format(date); }
function dueLabel(daysLeft: number) { if (daysLeft < 0) return `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "dag" : "dagen"} voorbij de vervaldatum`; if (daysLeft === 0) return "Vervalt vandaag"; if (daysLeft === 1) return "Vervalt morgen"; return `Nog ${daysLeft} dagen`; }
function counterparty(invoice: InvoiceRow) { return invoice.supplier_name ?? invoice.customer_name ?? "Factuur"; }
function actionCopy(invoice: InvoiceRow) { if (invoice.invoice_type === "purchase") return "Deze aankoopfactuur heeft een bevestigde vervaldatum. Controleer of de betaling geregeld is. Zonder bankkoppeling weet de app niet of je al betaald hebt."; if (invoice.invoice_type === "sale") return "Deze verkoopfactuur heeft een bevestigde vervaldatum. Controleer of je klant betaald heeft. Zonder bankkoppeling weet de app niet of het geld al ontvangen is."; return "Deze factuur heeft een bevestigde vervaldatum. Controleer wat er nog moet gebeuren. De app markeert betaling nooit automatisch als afgerond."; }
function priorityHeadline(data: DeadlinesData) {
  const overdueCount = data.now.filter((item) => item.daysLeft < 0).length;
  if (overdueCount > 0) return overdueCount === 1 ? "1 factuur is voorbij de vervaldatum" : `${overdueCount} facturen zijn voorbij de vervaldatum`;
  const todayCount = data.now.filter((item) => item.daysLeft === 0).length;
  if (todayCount > 0) return todayCount === 1 ? "1 factuur vervalt vandaag" : `${todayCount} facturen vervallen vandaag`;
  const withinWeekCount = data.now.filter((item) => item.daysLeft > 0 && item.daysLeft <= 7).length;
  if (withinWeekCount > 0) return withinWeekCount === 1 ? "1 factuur vraagt actie binnen 7 dagen" : `${withinWeekCount} facturen vragen actie binnen 7 dagen`;
  if (data.reviewCount > 0 || data.duplicateReviewCount > 0) return "Er zijn facturen die je eerst moet nakijken";
  return "Geen dringende factuuractie gevonden";
}

async function loadDeadlines(): Promise<DeadlinesData> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const company = await resolveActiveCompany(supabase, user.id);
    if (company.state !== "ready") return emptyData(company.state);
    const companyId = company.companyId;
    const invoices: InvoiceRow[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from("invoices").select("id, company_id, supplier_name, customer_name, invoice_number, invoice_type, invoice_date, due_date, total, currency, review_status, duplicate_resolution, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      if (error) return emptyData("error");
      const page = (data ?? []) as InvoiceRow[]; invoices.push(...page); if (page.length < PAGE_SIZE) break; offset += PAGE_SIZE;
    }
    const duplicateIds = possibleDuplicateInvoiceIds(invoices);
    const reviewCount = invoices.filter((invoice) => invoice.review_status !== "confirmed" && invoice.review_status !== "auto_verified").length;
    const duplicateReviewCount = invoices.filter((invoice) => duplicateIds.has(invoice.id)).length;
    const today = belgianTodayIso();
    const actions: DeadlineAction[] = invoices.filter((invoice) => Boolean(invoice.due_date) && (invoice.review_status === "confirmed" || invoice.review_status === "auto_verified") && !duplicateIds.has(invoice.id)).flatMap((invoice) => { const daysLeft = differenceInDays(invoice.due_date as string, today); return daysLeft === null ? [] : [{ invoice, daysLeft }]; }).sort((a, b) => a.daysLeft - b.daysLeft);
    return { state: "ready", reviewCount, duplicateReviewCount, now: actions.filter((item) => item.daysLeft <= 7), soon: actions.filter((item) => item.daysLeft > 7 && item.daysLeft <= 30), later: actions.filter((item) => item.daysLeft > 30) };
  } catch { return emptyData("error"); }
}

function DeadlineCard({ item }: { item: DeadlineAction }) { const { invoice, daysLeft } = item; const urgency = daysLeft < 0 ? "is-overdue" : daysLeft <= 7 ? "is-now" : daysLeft <= 30 ? "is-soon" : "is-later"; return <article className={`deadline-card ${urgency}`}><div className="deadline-card-top"><div><span className="deadline-overline">Factuurvervaldatum</span><h3>{counterparty(invoice)}</h3><p className="deadline-reference">{invoice.invoice_number ? `Factuur ${invoice.invoice_number}` : "Factuurnummer niet bevestigd"}</p></div><span className="deadline-countdown">{dueLabel(daysLeft)}</span></div><div className="deadline-date-row"><span>Vervaldatum</span><strong>{formatDate(invoice.due_date as string)}</strong></div><p className="deadline-explanation">{actionCopy(invoice)}</p><Link className="button secondary deadline-action" href={`/facturen/${invoice.id}`}>Bekijk factuur</Link></article>; }
function DeadlineGroup({ title, items, empty }: { title: string; items: DeadlineAction[]; empty: string }) { return <section className="deadline-group" aria-labelledby={`deadline-${title.replace(/\s+/g, "-").toLowerCase()}`}><div className="deadline-group-heading"><h2 id={`deadline-${title.replace(/\s+/g, "-").toLowerCase()}`}>{title}</h2><span>{items.length}</span></div>{items.length ? <div className="deadline-list">{items.map((item) => <DeadlineCard key={item.invoice.id} item={item} />)}</div> : <div className="card deadline-empty"><p>{empty}</p></div>}</section>; }

export default async function DeadlinesPage() {
  const data = await loadDeadlines();
  const stateMessage = data.state === "selection_required" ? { title: "Kies eerst welk bedrijf je wilt bekijken", text: "Kies één actief bedrijf. Daarna tonen we alleen de factuuracties en vervaldata van die onderneming.", href: "/bedrijf-kiezen?returnTo=/deadlines", action: "Bedrijf kiezen" } : data.state === "no_company" ? { title: "Stel eerst je bedrijf in", text: "Daarna kunnen acties en deadlines veilig aan één onderneming gekoppeld worden.", href: "/onboarding", action: "Bedrijf instellen" } : data.state === "error" ? { title: "We konden je acties nu niet betrouwbaar laden", text: "We tonen liever niets dan een verkeerde deadline of factuuractie.", href: "/deadlines", action: "Opnieuw proberen" } : null;
  const hasReviewWork = data.reviewCount > 0 || data.duplicateReviewCount > 0;
  return <div className="shell"><aside className="sidebar"><div className="brand">AI Bedrijfsadministratie</div><nav className="nav" aria-label="Hoofdnavigatie">{nav.map((item) => item.href ? <Link key={item.label} className={item.active ? "active" : ""} href={item.href}>{item.label}</Link> : <span key={item.label} className="nav-disabled" aria-disabled="true">{item.label}<small>Nog niet beschikbaar</small></span>)}</nav></aside>
    <main className="main deadlines-main"><header className="deadlines-heading"><div><div className="eyebrow">Deadlines</div><h1>Wat je moet doen, wanneer, en waarom.</h1><p className="muted">Geen drukke kalender. Alleen concrete acties waarvan we de datum betrouwbaar kennen.</p></div><div className="dashboard-heading-actions"><Link className="button secondary" href="/facturen">Facturen bekijken</Link><Link className="button secondary" href="/bedrijf-kiezen?returnTo=/deadlines">Bedrijf kiezen</Link></div></header>
    {stateMessage ? <section className="card deadline-state" role="status"><h2>{stateMessage.title}</h2><p className="muted">{stateMessage.text}</p><Link className="button secondary" href={stateMessage.href}>{stateMessage.action}</Link></section> : <><section className="card deadline-status-card" aria-labelledby="deadline-status-title"><div><div className="status status-neutral"><span className="dot dot-neutral" /><span id="deadline-status-title">{priorityHeadline(data)}</span></div><p className="muted">We gebruiken alleen vervaldata van facturen die al betrouwbaar bevestigd zijn. Mogelijke duplicaten en onzekere datums worden niet stilletjes als deadline gebruikt.</p></div>{hasReviewWork ? <div className="deadline-review-stack" aria-label="Facturen die nog controle nodig hebben">{data.reviewCount > 0 ? <div className="deadline-review-callout"><strong>{data.reviewCount} factuur{data.reviewCount === 1 ? "" : "en"} nog nakijken</strong><p>Die kunnen nog een vervaldatum bevatten die hier bewust niet wordt getoond zolang de uitlezing niet betrouwbaar is.</p><Link className="button secondary" href="/facturen">Controleer facturen</Link></div> : null}{data.duplicateReviewCount > 0 ? <div className="deadline-review-callout"><strong>{data.duplicateReviewCount} mogelijk dubbele factuur{data.duplicateReviewCount === 1 ? "" : "en"} controleren</strong><p>Deze facturen tellen bewust niet mee als deadline tot je hebt bevestigd of het echt een duplicaat is. Vergelijk de originele documenten voordat je beslist.</p><Link className="button secondary" href="/facturen">Controleer mogelijke dubbels</Link></div> : null}</div> : null}</section>
    <div className="deadline-groups"><DeadlineGroup title="Nu doen" items={data.now} empty="Geen bevestigde factuurvervaldatum binnen 7 dagen." /><DeadlineGroup title="Binnenkort" items={data.soon} empty="Geen bevestigde factuurvervaldatum tussen 8 en 30 dagen." /><DeadlineGroup title="Later" items={data.later} empty="Geen latere bevestigde factuurvervaldatums gevonden." /></div><section className="card deadline-safety-note" aria-labelledby="legal-deadlines-title"><div className="eyebrow">Bewust nog niet automatisch</div><h2 id="legal-deadlines-title">Wettelijke en fiscale deadlines</h2><p>De app toont nog geen btw-aangifte, sociale bijdragen of andere wettelijke deadline als harde datum zolang die niet uit gecontroleerde officiële rule-data komt én zeker op jouw bedrijfsprofiel van toepassing is.</p><p className="muted">Dat voorkomt dat een generieke datum fout als persoonlijke verplichting wordt getoond. Zodra die rule-engine actief is, verschijnen zulke deadlines hier met bron en controledatum.</p></section></>}
    </main><nav className="mobile-nav" aria-label="Mobiele navigatie"><Link href="/dashboard">Home</Link><Link href="/facturen">Facturen</Link><Link href="/documenten">Documenten</Link><Link className="active" href="/deadlines">Deadlines</Link><Link href="/onboarding">Bedrijf</Link></nav></div>;
}
