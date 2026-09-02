import Link from "next/link";
import "./dashboard.css";
import LogoutButton from "./logout-button";

const nav = [
  { label: "Dashboard", href: "/dashboard", active: true },
  { label: "Facturen", href: "/facturen" },
  { label: "Documenten", href: null },
  { label: "Deadlines", href: null },
  { label: "Assistent", href: null },
  { label: "Bedrijf", href: "/onboarding" },
];

const metrics = [
  {
    label: "Omzet",
    value: "Nog geen gegevens",
    what: "Omzet is het totaal van je verkopen in de gekozen periode, vóór je zakelijke kosten ervan afgaan.",
    source: "Later tellen we hiervoor alleen verkoopfacturen mee die voldoende betrouwbaar zijn of door jou bevestigd zijn.",
    unknown: "Heb je nog geen verkoopfacturen toegevoegd? Dan tonen we geen bedrag en doen we alsof er niets bekend is.",
  },
  {
    label: "Zakelijke kosten",
    value: "Nog geen gegevens",
    what: "Dit zijn uitgaven die je in de app als zakelijke aankoop registreert. Niet elke kost heeft automatisch dezelfde fiscale behandeling.",
    source: "Later komt het bedrag uit je bevestigde aankoopfacturen. Je kunt dan exact zien welke facturen meetellen.",
    unknown: "Als facturen nog onzeker zijn, houden we die apart zodat een voorlopig bedrag niet als definitieve waarheid wordt getoond.",
  },
  {
    label: "Verschil",
    value: "Nog niet berekend",
    what: "Dit is simpelweg omzet min de zakelijke kosten die in dit overzicht meetellen.",
    source: "Het wordt door vaste code berekend uit dezelfde onderliggende facturen als omzet en kosten.",
    unknown: "Dit is niet automatisch je nettowinst of je belastbaar inkomen. Daarvoor kunnen extra regels en gegevens nodig zijn.",
  },
  {
    label: "Geschatte btw",
    value: "Nog niet berekend",
    what: "Dit wordt later een voorlopige btw-schatting op basis van voldoende betrouwbare factuurgegevens en jouw bevestigde btw-profiel.",
    source: "Je zult kunnen doorklikken naar de gebruikte facturen, de berekening en de regelbron die voor jouw profiel geldt.",
    unknown: "Als je btw-status, aangifteregime of factuurdata niet bevestigd is, tonen we geen definitieve btw-conclusie.",
  },
];

export default function DashboardPage() {
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
              <span key={item.label} className="nav-disabled" aria-disabled="true" title="Dit onderdeel wordt nog gebouwd">
                {item.label}<small>Nog niet beschikbaar</small>
              </span>
            ),
          )}
        </nav>
      </aside>

      <main className="main dashboard-main">
        <header className="dashboard-heading">
          <div>
            <div className="eyebrow">Dashboard</div>
            <h1>Je administratie, zonder giswerk.</h1>
            <p className="muted">We tonen pas cijfers en statussen zodra we genoeg betrouwbare gegevens hebben.</p>
          </div>
          <div className="dashboard-heading-actions">
            <Link className="button secondary" href="/onboarding">Bedrijfsgegevens bekijken</Link>
            <LogoutButton />
          </div>
        </header>

        <section className="card dashboard-status-card" aria-labelledby="status-title">
          <div className="status status-neutral"><span className="dot dot-neutral" /><span id="status-title">Nog niet genoeg gegevens om je administratie te beoordelen</span></div>
          <p className="muted">Dat is bewust. Zonder bevestigde facturen zeggen we niet dat alles in orde is.</p>
        </section>

        <section className="card dashboard-status-card" aria-labelledby="profile-data-title">
          <div className="status status-neutral"><span className="dot dot-neutral" /><span id="profile-data-title">Je bedrijfsprofiel kan veilig worden opgeslagen en opnieuw geladen</span></div>
          <p className="muted">Onboardinggegevens worden gekoppeld aan het bedrijf waarvoor je toegang hebt. Onbekende of onbevestigde gegevens blijven als onzeker behandeld en worden niet stilletjes als fiscale waarheid gebruikt.</p>
          <details className="help-details dashboard-help">
            <summary>Wat betekent dit?</summary>
            <div className="help-details-body">
              <div><strong>Waar worden je gegevens bewaard?</strong><p>In de beveiligde bedrijfsdatabase, gekoppeld aan je account en bedrijf.</p></div>
              <div><strong>Wie kan ze zien?</strong><p>Alleen ingelogde gebruikers met een geldige relatie tot dat bedrijf. De database dwingt deze scheiding af met Row Level Security.</p></div>
              <div><strong>Wat gebeurt er met twijfel?</strong><p>Gegevens die je niet weet of nog niet bevestigd hebt, blijven zichtbaar als onzeker en sturen geen definitieve deadlines of conclusies aan.</p></div>
            </div>
          </details>
        </section>

        <section className="grid grid-4 dashboard-metrics" aria-label="Financieel overzicht">
          {metrics.map((metric) => (
            <article className="card metric-card" key={metric.label}>
              <div className="metric-label">{metric.label}</div>
              <div className="kpi kpi-empty">{metric.value}</div>
              <details className="help-details dashboard-help">
                <summary>Leg dit simpel uit</summary>
                <div className="help-details-body">
                  <div><strong>Wat is dit?</strong><p>{metric.what}</p></div>
                  <div><strong>Waar komt dit vandaan?</strong><p>{metric.source}</p></div>
                  <div><strong>Wat als we het niet zeker weten?</strong><p>{metric.unknown}</p></div>
                </div>
              </details>
            </article>
          ))}
        </section>

        <section className="dashboard-lower-grid">
          <article className="card action-card">
            <div className="card-heading-row"><h2>Wat moet er nu gebeuren?</h2><span className="soft-badge">Veiligheid eerst</span></div>
            <div className="action-item">
              <div className="action-number">1</div>
              <div>
                <strong>Accountflow volledig testen</strong>
                <p className="muted">Registreren, bevestigen, opnieuw inloggen, uitloggen, wachtwoord resetten en daarna controleren dat dezelfde bedrijfsgegevens terugkomen.</p>
              </div>
            </div>
            <Link className="button secondary" href="/onboarding">Bedrijfsgegevens controleren</Link>
          </article>

          <article className="card">
            <h2>Administratie compleet</h2>
            <div className="kpi kpi-empty">Nog niet meetbaar</div>
            <p className="muted">We verzinnen geen percentage. Een volledigheidsscore moet later verklaarbaar zijn met concrete ontbrekende gegevens of controles.</p>
            <details className="help-details dashboard-help">
              <summary>Hoe wordt dit later bepaald?</summary>
              <div className="help-details-body">
                <div><strong>We kijken bijvoorbeeld naar</strong><p>onvolledige bedrijfsgegevens, facturen die nog nagekeken moeten worden en documenten die niet betrouwbaar verwerkt konden worden.</p></div>
                <div><strong>Belangrijk</strong><p>Elke reden waarom je administratie niet compleet is, moet zichtbaar en oplosbaar zijn.</p></div>
              </div>
            </details>
          </article>

          <article className="card">
            <h2>Recente facturen</h2>
            <div className="empty-state">
              <strong>Nog geen facturen toegevoegd</strong>
              <p className="muted">De volgende productstap is een veilige uploadflow waarbij originele documenten privé blijven en altijd aan het juiste bedrijf gekoppeld worden.</p>
              <Link className="text-button" href="/facturen">Bekijk hoe facturen straks werken</Link>
            </div>
          </article>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobiele navigatie">
        <Link className="active" href="/dashboard">Home</Link>
        <Link href="/facturen">Facturen</Link>
        <Link href="/onboarding">Bedrijf</Link>
        <span aria-disabled="true">Deadlines</span>
        <span aria-disabled="true">Meer</span>
      </nav>
    </div>
  );
}
