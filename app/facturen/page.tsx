import Link from "next/link";
import InvoiceUpload from "./invoice-upload";
import InvoiceList from "./invoice-list";
import "./facturen.css";

const nav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Facturen", href: "/facturen", active: true },
  { label: "Documenten", href: null },
  { label: "Deadlines", href: null },
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

export default function FacturenPage() {
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

        <InvoiceUpload />
        <InvoiceList />

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
          <h2 id="einvoice-title">Een PDF uploaden is niet hetzelfde als een verplichte B2B e-factuur.</h2>
          <p>Voor quasi alle facturen tussen Belgische btw-plichtige ondernemingen is sinds 1 januari 2026 een <strong>gestructureerde elektronische factuur</strong> nodig. Een gewone PDF via e-mail volstaat daarvoor niet.</p>
          <details className="help-details">
            <summary>Wat betekent dit voor mij?</summary>
            <div className="help-details-body">
              <div><strong>Wat is een gestructureerde e-factuur?</strong><p>Dat is een factuur in een vast computerleesbaar formaat zodat softwaresystemen de gegevens rechtstreeks kunnen uitwisselen. In België gebeurt dit in principe via Peppol.</p></div>
              <div><strong>Waarom kan ik dan PDF&apos;s uploaden?</strong><p>PDF, JPG en PNG blijven nuttig om bestaande documenten te bewaren en administratief te verwerken. Zo&apos;n upload bewijst op zichzelf niet dat je aan de B2B e-facturatieplicht hebt voldaan.</p></div>
              <div><strong>Geldt dit voor elke factuur?</strong><p>Nee. Er zijn uitzonderingen en de verplichting verschilt bijvoorbeeld bij particuliere klanten of bepaalde andere situaties. Daarom mag de app nooit alleen op basis van het bestandstype zeggen dat je wettelijk in orde bent.</p></div>
            </div>
          </details>
          <p className="source-note">Bron: officiële Belgische e-facturatie-informatie. Regel gecontroleerd op 2 september 2026.</p>
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
        <Link href="/dashboard">Home</Link><Link className="active" href="/facturen">Facturen</Link><Link href="/onboarding">Bedrijf</Link><span aria-disabled="true">Deadlines</span><span aria-disabled="true">Meer</span>
      </nav>
    </div>
  );
}
