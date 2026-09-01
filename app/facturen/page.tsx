import Link from "next/link";
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
    unknown: "Twijfel je? Upload de factuur later gewoon. De app stelt eerst zelf het type voor en vraagt alleen bevestiging als dat nodig is.",
  },
  {
    title: "Verkoopfactuur",
    short: "Een factuur die jouw bedrijf aan een klant stuurt voor iets dat je verkoopt.",
    example: "Bijvoorbeeld een factuur aan een klant voor een uitgevoerde dienst of verkocht product.",
    unknown: "Je hoeft dit later niet vooraf te kiezen. We lezen eerst het document en tonen wat we denken dat het is.",
  },
  {
    title: "Bedrag zonder btw",
    short: "Het bedrag vóór eventuele btw erbij wordt geteld.",
    example: "Als een factuur €121 totaal is en €21 daarvan btw is, is het bedrag zonder btw €100.",
    unknown: "Als de bedragen niet duidelijk optellen, markeren we de factuur als 'Nakijken' in plaats van zelf iets te verzinnen.",
  },
  {
    title: "Vervaldatum",
    short: "De datum tegen wanneer de factuur normaal betaald moet zijn.",
    example: "Staat er 'te betalen vóór 30 september', dan is 30 september de vervaldatum.",
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
              <Link key={item.label} className={item.active ? "active" : ""} href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className="nav-disabled" aria-disabled="true">
                {item.label}<small>Nog niet beschikbaar</small>
              </span>
            ),
          )}
        </nav>
      </aside>

      <main className="main invoices-main">
        <header className="invoices-heading">
          <div>
            <div className="eyebrow">Facturen</div>
            <h1>Alles wat je koopt en verkoopt op één plek.</h1>
            <p className="muted">Je hoeft geen boekhoudkundige termen of categorieën te kennen. De app moet het zware denkwerk doen en alleen vragen stellen wanneer iets echt onzeker is.</p>
          </div>
          <button className="button" type="button" disabled title="Upload wordt geactiveerd zodra veilige opslag per bedrijf volledig getest is">
            + Factuur uploaden
          </button>
        </header>

        <section className="card invoice-safety-card" aria-labelledby="upload-status-title">
          <div>
            <div className="status status-neutral"><span className="dot dot-neutral" /><span id="upload-status-title">Upload is in deze preview bewust nog uitgeschakeld</span></div>
            <p className="muted">Facturen bevatten gevoelige bedrijfsinformatie. We activeren upload pas wanneer opslag, company-isolatie en toegangsregels aantoonbaar veilig werken.</p>
          </div>
          <details className="help-details">
            <summary>Wat moet eerst kloppen?</summary>
            <div className="help-details-body">
              <div><strong>Veilige opslag</strong><p>Een bestand moet privé worden opgeslagen en gekoppeld zijn aan precies het juiste bedrijf.</p></div>
              <div><strong>Toegang testen</strong><p>Een gebruiker van bedrijf A mag nooit een factuur van bedrijf B kunnen openen, ook niet met een rechtstreekse bestandslink.</p></div>
              <div><strong>Daarna pas AI</strong><p>Pas na veilige opslag laten we de factuur uitlezen, controleren en categoriseren.</p></div>
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
              <div><strong>Wat is een gestructureerde e-factuur?</strong><p>Dat is een factuur in een vast computerleesbaar formaat zodat twee softwaresystemen de gegevens rechtstreeks kunnen uitwisselen. In België gebeurt dit in principe via Peppol.</p></div>
              <div><strong>Waarom kan ik dan later nog PDF&apos;s uploaden?</strong><p>PDF, JPG en PNG blijven nuttig om bestaande documenten te bewaren, te lezen en administratief te verwerken. Zo&apos;n upload bewijst op zichzelf niet dat je aan de B2B e-facturatieplicht hebt voldaan.</p></div>
              <div><strong>Geldt dit voor elke factuur?</strong><p>Nee. Er zijn uitzonderingen en de verplichting verschilt bijvoorbeeld bij particuliere klanten of bepaalde andere situaties. De app mag daarom nooit alleen op basis van het bestandstype beslissen dat je wettelijk in orde bent.</p></div>
              <div><strong>Hoe controleer ik dit officieel?</strong><p>Gebruik de officiële Belgische e-facturatiesite van de overheid. Daar staat voor wie de verplichting geldt en hoe Peppol werkt.</p></div>
            </div>
          </details>
          <p className="source-note">Bron: e-factuur België, officiële overheidsinformatie. Regel gecontroleerd op 2 september 2026.</p>
        </section>

        <section className="invoice-toolbar card" aria-label="Factuurfilters">
          <div className="invoice-search-placeholder" aria-disabled="true">Zoek later bv. Meta, €242 of marketing</div>
          <div className="invoice-filter-row" aria-label="Voorbeeldfilters">
            <span className="filter-chip active">Alles</span>
            <span className="filter-chip">In orde</span>
            <span className="filter-chip">Nakijken</span>
          </div>
        </section>

        <section className="card invoices-empty-state">
          <div className="empty-icon" aria-hidden="true">↥</div>
          <h2>Nog geen facturen</h2>
          <p className="muted">Zodra veilige upload actief is, kun je PDF-, JPG- en PNG-facturen toevoegen om ze te bewaren en verwerken. Dat staat los van de vraag of een factuur volgens de Belgische regels ook als gestructureerde e-factuur via Peppol moet worden uitgewisseld.</p>
          <div className="empty-state-steps" aria-label="Toekomstige factuurflow">
            <span><strong>1.</strong> Jij uploadt</span>
            <span><strong>2.</strong> Wij lezen en controleren</span>
            <span><strong>3.</strong> Alleen twijfelgevallen komen bij jou terug</span>
          </div>
        </section>

        <section className="invoice-learning-section" aria-labelledby="terms-title">
          <div className="section-intro">
            <div>
              <div className="eyebrow">Geen voorkennis nodig</div>
              <h2 id="terms-title">Woorden die je hier gaat tegenkomen</h2>
            </div>
            <p className="muted">Ook eenvoudige termen leggen we uit. Je hoeft nooit te gokken omdat de app veronderstelt dat je iets al kent.</p>
          </div>

          <div className="invoice-term-grid">
            {invoiceTerms.map((term) => (
              <article className="card term-card" key={term.title}>
                <h3>{term.title}</h3>
                <p>{term.short}</p>
                <details className="help-details compact-help">
                  <summary>Leg verder uit</summary>
                  <div className="help-details-body">
                    <div><strong>Voorbeeld</strong><p>{term.example}</p></div>
                    <div><strong>Wat als ik het niet weet?</strong><p>{term.unknown}</p></div>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">
        <Link href="/dashboard">Home</Link>
        <Link className="active" href="/facturen">Facturen</Link>
        <Link href="/onboarding">Bedrijf</Link>
        <span aria-disabled="true">Deadlines</span>
        <span aria-disabled="true">Meer</span>
      </nav>
    </div>
  );
}
