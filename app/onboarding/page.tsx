import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main className="main" style={{ maxWidth: 760 }}>
      <div className="muted" style={{ marginBottom: 10 }}>Stap 1 van 7</div>
      <h1>We maken je administratie simpel.</h1>
      <p className="muted">Beantwoord een paar vragen. Daarna tonen we alleen wat voor jouw bedrijf relevant is.</p>

      <section className="card" style={{ marginTop: 22 }}>
        <form className="form">
          <div className="field">
            <label htmlFor="companyName">Naam bedrijf ⓘ</label>
            <input className="input" id="companyName" name="companyName" placeholder="bv. Mijn Webshop" />
            <div className="info">De naam waarmee jij je onderneming herkent. We gebruiken dit in je dashboard en documenten.</div>
          </div>

          <div className="field">
            <label htmlFor="enterpriseNumber">Ondernemingsnummer ⓘ</label>
            <input className="input" id="enterpriseNumber" name="enterpriseNumber" inputMode="numeric" placeholder="bv. 0123.456.789" />
            <div className="info">Dit unieke nummer komt uit de Kruispuntbank van Ondernemingen. We behandelen btw-status apart.</div>
            <button className="button secondary" type="button" style={{ justifySelf: "start" }}>Ik weet dit niet</button>
          </div>

          <div className="field">
            <label htmlFor="startDate">Startdatum onderneming ⓘ</label>
            <input className="input" id="startDate" name="startDate" type="date" />
            <div className="info">Deze datum helpt later bepalen welke periodes en verplichtingen relevant kunnen zijn.</div>
          </div>

          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <Link className="button secondary" href="/">Terug</Link>
            <button className="button" type="button">Volgende</button>
          </div>
        </form>
      </section>
    </main>
  );
}
