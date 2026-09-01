import Link from "next/link";

export default function HomePage() {
  return (
    <main className="main" style={{ minHeight: "100vh", display: "grid", alignContent: "center" }}>
      <div className="card" style={{ maxWidth: 760, padding: 28 }}>
        <div className="status"><span className="dot" /> Belgische bedrijfsadministratie, simpel uitgelegd</div>
        <h1 style={{ fontSize: "clamp(2.2rem, 7vw, 4.6rem)", lineHeight: 1, margin: "22px 0 18px" }}>We maken administratie begrijpelijk.</h1>
        <p className="muted" style={{ fontSize: "1.08rem", lineHeight: 1.7 }}>
          Upload facturen en documenten. De app leest, controleert en legt uit wat er gebeurt. Belangrijke cijfers blijven traceerbaar naar hun bron en fiscale regels worden niet door AI verzonnen.
        </p>
        <div className="row" style={{ marginTop: 22 }}>
          <Link className="button" href="/onboarding">Mijn bedrijf instellen</Link>
          <Link className="button secondary" href="/dashboard">Bekijk demo-dashboard</Link>
        </div>
      </div>
    </main>
  );
}
