import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import InvoiceUpload from "./invoice-upload";
import InvoiceDuplicateAlerts from "./invoice-duplicate-alerts";
import InvoiceList, { type InvoiceListFilters } from "./invoice-list";
import "./facturen.css";

const nav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Facturen", href: "/facturen", active: true },
  { label: "Documenten", href: "/documenten" },
  { label: "Deadlines", href: "/deadlines" },
  { label: "Assistent", href: null },
  { label: "Bedrijf", href: "/onboarding" },
];

const invoiceTerms = [
  {
    title: "Aankoopfactuur",
    short: "Een factuur die jouw bedrijf krijgt wanneer het iets koopt.",
    example: "Bijvoorbeeld een factuur van Proximus, Canva of een leverancier van materiaal.",
    unknown: "Twijfel je? Upload de factuur gewoon. De app probeert het type te herkennen en houdt twijfel zichtbaar.",
  },
  {
    title: "Verkoopfactuur",
    short: "Een factuur die jouw bedrijf aan een klant stuurt voor iets dat je verkoopt.",
    example: "Bijvoorbeeld een factuur aan een klant voor een uitgevoerde dienst of verkocht product.",
    unknown: "Je hoeft dit bij upload niet vooraf te kiezen. Als de uitlezing het niet betrouwbaar kan bepalen, blijft het onbekend.",
  },
  {
    title: "Bedrag zonder btw",
    short: "Het bedrag vóór eventuele btw erbij wordt geteld.",
    example: "Als een factuur €121 totaal is en €21 daarvan btw is, is het bedrag zonder btw €100.",
    unknown: "Als de bedragen niet duidelijk optellen, blijft de factuur een controlepunt in plaats van dat we een bedrag verzinnen.",
  },
  {
    title: "Vervaldatum",
    short: "De datum tegen wanneer de factuur normaal betaald moet zijn.",
    example: "Staat er ‘te betalen vóór 30 september’, dan is 30 september de vervaldatum.",
    unknown: "Niet elke factuur toont dit duidelijk. Als we geen betrouwbare datum vinden, blijft dit veld onbevestigd.",
  },
];

type FacturenPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CompanyState = "ready" | "no_company" | "multiple_companies" | "error" | "signed_out";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getCompanyState(): Promise<CompanyState> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return "error";
    if (!user) return "signed_out";

    const { data: memberships, error: membershipError } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(2);

    if (membershipError) return "error";
    if (!memberships?.length) return "no_company";
    if (memberships.length > 1) return "multiple_companies";
    return "ready";
  } catch {
    return "error";
  }
}

function CompanyGate({ state }: { state: Exclude<CompanyState, "ready"> }) {
  const copy = state === "multiple_companies"
    ? {
        title: "Kies eerst welk bedrijf je wilt beheren",
        text: "We laden of uploaden bewust geen facturen zolang er meerdere actieve bedrijven zijn. Zo kunnen gegevens van twee ondernemingen nooit stilletjes door elkaar lopen.",
        href: "/onboarding",
        action: "Bedrijfsgegevens bekijken",
      }
    : state === "no_company"
      ? {
          title: "Stel eerst je bedrijf in",
          text: "Facturen moeten altijd aan één onderneming gekoppeld zijn. Maak of controleer daarom eerst je bedrijfsprofiel.",
          href: "/onboarding",
          action: "Mijn bedrijf instellen",
        }
      : state === "signed_out"
        ? {
            title: "Meld je opnieuw aan",
            text: "We konden geen actieve sessie bevestigen. Er worden daarom geen bedrijfsgegevens geladen.",
            href: "/login",
            action: "Naar aanmelden",
          }
        : {
            title: "We konden je bedrijfscontext nu niet betrouwbaar controleren",
            text: "Dit betekent niet dat je facturen weg zijn. We tonen of wijzigen niets totdat de toegangscontrole opnieuw betrouwbaar lukt.",
            href: "/facturen",
            action: "Opnieuw proberen",
          };

  return (
    <section className="card invoices-empty-state" role="status" aria-live="polite">
      <div className="empty-icon" aria-hidden="true">!</div>
      <h2>{copy.title}</h2>
      <p className="muted">{copy.text}</p>
      <Link className="button secondary" href={copy.href}>{copy.action}</Link>
    </section>
  );
}

export default async function FacturenPage({ searchParams }: FacturenPageProps) {
  const params = await searchParams;
  const filters: InvoiceListFilters = {
    q: firstParam(params.q),
    type: firstParam(params.type),
    category: firstParam(params.category),
    status: firstParam(params.status),
  };
  const companyState = await getCompanyState();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Bedrijfsadministratie</div>
        <nav className="nav" aria-label="Hoofdnavigatie">
          {nav.map((item) =>
            item.href ? (
              <Link key={item.label} className={item.active ? "active" : ""} href={item.href}>{item.label}</Link>
            ) : (
              <span key={item.label} className="nav-disabled" aria-disabled="true">{item.label}<small>Nog niet beschikbaar</small></span>
            ),
          )}
        </nav>
      </aside>

      <main className="main invoices-main">
        <header className="invoices-heading">
          <div>
            <div className="eyebrow">Facturen</div>
            <h1>Upload je facturen zonder boekhoudwerk.</h1>
            <p className="muted">Het originele bestand wordt eerst veilig opgeslagen. Wanneer AI-uitlezing op de server is geactiveerd, lezen we de belangrijkste velden gestructureerd uit en blijft elke onzekerheid zichtbaar.</p>
          </div>
        </header>

        {companyState === "ready" ? (
          <>
            <InvoiceUpload />
            <InvoiceDuplicateAlerts />
            <InvoiceList filters={filters} />
            <section className="card" aria-labelledby="export-title">
              <div className="eyebrow">Je data blijft van jou</div>
              <h2 id="export-title">Gegevens exporteren</h2>
              <p className="muted">Download een leesbare CSV die je kunt openen in Excel of LibreOffice. We exporteren alleen gegevens van het ene bedrijf dat je nu veilig kunt gebruiken.</p>
              <div className="dashboard-heading-actions">
                <a className="button secondary" href="/api/exports/invoices">Exporteer facturen</a>
                <a className="button secondary" href="/api/exports/company">Exporteer bedrijfsgegevens</a>
              </div>
            </section>
          </>
        ) : (
          <CompanyGate state={companyState} />
        )}

        <section className="card invoice-safety-card" aria-labelledby="upload-status-title">
          <div>
            <div className="status status-neutral"><span className="dot dot-neutral" /><span id="upload-status-title">Originele facturen worden privé en onveranderbaar bewaard</span></div>
            <p className="muted">AI-resultaten staan los van het originele document. Een modelresultaat moet eerst door een strikt schema, wordt als aparte extractie-audit bewaard en blijft voorlopig een controlepunt.</p>
          </div>
          <details className="help-details">
            <summary>Waarom controleren we dit?</summary>
            <div className="help-details-body">
              <div><strong>Echt bestandstype</strong><p>We vertrouwen niet alleen op de bestandsnaam. Een bestand dat bijvoorbeeld “.pdf” heet maar geen echte PDF is, wordt geweigerd.</p></div>
              <div><strong>Geen stille AI-gok</strong><p>Kan een veld niet betrouwbaar worden gelezen, dan blijft het onbekend. Ook een ontbrekende valuta wordt niet automatisch als euro ingevuld.</p></div>
              <div><strong>Origineel blijft origineel</strong><p>Uitleesresultaten worden apart opgeslagen en vervangen nooit het document dat jij hebt geüpload.</p></div>
            </div>
          </details>
        </section>

        <section className="card invoice-compliance-card" aria-labelledby="einvoice-title">
          <div className="eyebrow">Belangrijk sinds 1 januari 2026</div>
          <h2 id="einvoice-title">Een PDF uploaden is niet hetzelfde als voldoen aan de B2B e-facturatieplicht.</h2>
          <p>Voor B2B-handelingen tussen Belgische btw-plichtige ondernemingen is sinds 1 januari 2026 in principe een <strong>gestructureerde elektronische factuur</strong> nodig. Een gewone PDF via e-mail volstaat daarvoor normaal niet.</p>
          <details className="help-details">
            <summary>Wat betekent dit voor mij?</summary>
            <div className="help-details-body">
              <div><strong>Wat is een gestructureerde e-factuur?</strong><p>Dat is een factuur in een vast computerleesbaar formaat zodat softwaresystemen de gegevens rechtstreeks kunnen uitwisselen. In België moet je zulke facturen in principe via het Peppol-netwerk kunnen versturen en ontvangen.</p></div>
              <div><strong>Waarom kan ik dan PDF&apos;s uploaden?</strong><p>PDF, JPG en PNG blijven nuttig om documenten te bewaren en administratief te verwerken. Zo&apos;n upload bewijst op zichzelf niet dat de wettelijk vereiste gestructureerde factuur correct werd verstuurd of ontvangen.</p></div>
              <div><strong>Geldt dit altijd?</strong><p>Nee. Er zijn beperkte uitzonderingen en er bestaat onder voorwaarden een terugvalmogelijkheid bij technische onmogelijkheid. Ook B2C en bepaalde internationale situaties vallen anders. Daarom beslist deze app nooit alleen op basis van een PDF dat je wettelijk in orde bent.</p></div>
            </div>
          </details>
          <div>
            <a
              className="text-button"
              href="https://efactuur.belgium.be/nl/article/voor-wie-wordt-e-facturatie-verplicht"
              target="_blank"
              rel="noreferrer"
            >
              Controleer officieel of dit voor jou geldt
            </a>
          </div>
          <p className="source-note">Officiële bron: e-factuur.belgium.be. Regel opnieuw gecontroleerd op 9 september 2026.</p>
        </section>

        <section className="invoice-learning-section" aria-labelledby="terms-title">
          <div className="section-intro">
            <div><div className="eyebrow">Geen voorkennis nodig</div><h2 id="terms-title">Woorden die je hier gaat tegenkomen</h2></div>
            <p className="muted">Ook eenvoudige termen leggen we uit. Je hoeft nooit te gokken omdat de app veronderstelt dat je iets al kent.</p>
          </div>
          <div className="invoice-term-grid">
            {invoiceTerms.map((term) => (
              <article className="card term-card" key={term.title}>
                <h3>{term.title}</h3><p>{term.short}</p>
                <details className="help-details compact-help"><summary>Leg verder uit</summary><div className="help-details-body"><div><strong>Voorbeeld</strong><p>{term.example}</p></div><div><strong>Wat als ik het niet weet?</strong><p>{term.unknown}</p></div></div></details>
              </article>
            ))}
          </div>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">
        <Link href="/dashboard">Home</Link><Link className="active" href="/facturen">Facturen</Link><Link href="/documenten">Documenten</Link><Link href="/deadlines">Deadlines</Link><Link href="/onboarding">Bedrijf</Link>
      </nav>
    </div>
  );
}
