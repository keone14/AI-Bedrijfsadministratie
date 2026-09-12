import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="brand-mark">AI Bedrijfsadministratie</div>
        <Link className="button secondary" href="/login">Inloggen</Link>
      </header>

      <section className="landing-hero">
        <div className="eyebrow">Voor Belgische ondernemers</div>
        <h1>Je administratie begrijpen zonder boekhouderstaal.</h1>
        <p className="hero-copy">
          Eén rustige plek voor je bedrijfsgegevens, facturen, documenten, deadlines en uitleg. De app helpt je zien wat in orde is, wat nog aandacht vraagt en waar bedragen vandaan komen.
        </p>
        <div className="row hero-actions">
          <Link className="button" href="/login">Start met mijn bedrijf</Link>
          <Link className="button secondary" href="/dashboard">Bekijk voorbeeld</Link>
        </div>
        <div className="trust-row" aria-label="Belangrijkste betrouwbaarheidsprincipes">
          <span>Bronnen controleerbaar</span>
          <span>Bedrijfsdata afgeschermd</span>
          <span>Geen fiscale zekerheid uit vrije AI</span>
        </div>
      </section>

      <section className="landing-grid">
        <article className="card feature-card">
          <div className="feature-number">01</div>
          <h2>Zie wat je moet doen</h2>
          <p className="muted">Geen overvolle administratie. Alleen relevante acties, waarschuwingen en deadlines voor jouw bedrijf.</p>
        </article>
        <article className="card feature-card">
          <div className="feature-number">02</div>
          <h2>Begrijp je cijfers</h2>
          <p className="muted">Omzet, kosten en schattingen worden eenvoudig uitgelegd en blijven traceerbaar naar de onderliggende gegevens.</p>
        </article>
        <article className="card feature-card">
          <div className="feature-number">03</div>
          <h2>Hou controle</h2>
          <p className="muted">AI helpt lezen en voorstellen doen, maar twijfel wordt zichtbaar gemaakt en belangrijke beslissingen blijven controleerbaar.</p>
        </article>
      </section>
    </main>
  );
}
