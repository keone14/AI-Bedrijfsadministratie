const nav = ["Dashboard", "Facturen", "Documenten", "Deadlines", "Assistent", "Bedrijf"];

export default function DashboardPage() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AI Bedrijfsadministratie</div>
        <nav className="nav">
          {nav.map((item, index) => <a key={item} className={index === 0 ? "active" : ""} href="#">{item}</a>)}
        </nav>
      </aside>
      <main className="main">
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="status"><span className="dot" /> Alles wat we momenteel kunnen controleren ziet er goed uit</div>
          <p className="muted" style={{ margin: "10px 0 0" }}>Demo-data. Echte statussen worden pas getoond wanneer brondata en controles voldoende betrouwbaar zijn.</p>
        </section>

        <section className="grid grid-4" style={{ marginBottom: 16 }}>
          {[
            ["Omzet", "€ 0,00", "Wat is omzet?"],
            ["Zakelijke kosten", "€ 0,00", "Wat tellen we mee?"],
            ["Verschil", "€ 0,00", "Dit is niet automatisch nettowinst."],
            ["Geschatte btw", "Nog niet berekend", "Pas na voldoende betrouwbare data."],
          ].map(([label, value, note]) => (
            <article className="card" key={label}>
              <div className="muted">{label} ⓘ</div>
              <div className="kpi">{value}</div>
              <div className="info">{note}</div>
            </article>
          ))}
        </section>

        <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <article className="card">
            <h2>Wat moet ik doen?</h2>
            <p className="muted">Je hebt nog geen echte bedrijfsdata toegevoegd.</p>
            <a className="button" href="/onboarding">Bedrijf instellen</a>
          </article>
          <article className="card">
            <h2>Administratie compleet</h2>
            <div className="kpi">Nog niet meetbaar</div>
            <p className="muted">We tonen geen willekeurig percentage. De score wordt pas opgebouwd uit concrete controles.</p>
          </article>
          <article className="card">
            <h2>Recente facturen</h2>
            <p className="muted">Nog geen facturen.</p>
            <button className="button secondary">+ Factuur uploaden</button>
          </article>
        </section>
      </main>

      <nav className="mobile-nav">
        <a href="#">Home</a><a href="#">Facturen</a><a href="#">+</a><a href="#">Deadlines</a><a href="#">Meer</a>
      </nav>
    </div>
  );
}
