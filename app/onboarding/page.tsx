"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type FormState = {
  companyName: string;
  enterpriseNumber: string;
  startDate: string;
  legalForm: string;
  occupationStatus: string;
  vatStatus: string;
  vatFrequency: string;
  activity: string;
  sells: string;
  employeeStatus: string;
};

const initialState: FormState = {
  companyName: "",
  enterpriseNumber: "",
  startDate: "",
  legalForm: "",
  occupationStatus: "",
  vatStatus: "",
  vatFrequency: "",
  activity: "",
  sells: "",
  employeeStatus: "",
};

const steps = ["Welkom", "Basisgegevens", "Type onderneming", "Btw", "Activiteit", "Personeel", "Controle"];

function Choice({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`choice-card${active ? " active" : ""}`} onClick={onClick}>{children}</button>;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);
  const [notice, setNotice] = useState<string | null>(null);

  const missing = useMemo(() => Object.values(form).filter((value) => !value).length, [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function next() {
    if (step === 1 && (!form.companyName || !form.enterpriseNumber || !form.startDate)) {
      setNotice("Vul de basisgegevens in. Als je iets niet weet, kun je dat later veilig controleren.");
      return;
    }
    setNotice(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <div className="onboarding-topbar">
          <Link className="brand-link" href="/">AI Bedrijfsadministratie</Link>
          <div className="step-label">Stap {step + 1} van {steps.length}</div>
        </div>

        <div className="progress-track" aria-hidden="true"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>

        {step === 0 ? (
          <section className="onboarding-content welcome-step">
            <div className="eyebrow">Eerst je bedrijf leren kennen</div>
            <h1>We maken je administratie simpel.</h1>
            <p className="hero-copy">Beantwoord een paar korte vragen. Daarna kan de app alleen tonen wat voor jouw onderneming relevant is.</p>
            <div className="card trust-panel">
              <strong>Waarom vragen we dit?</strong>
              <p className="muted">Je rechtsvorm, btw-status en activiteit kunnen beïnvloeden welke administratie en deadlines relevant zijn. We gokken daar niet naar.</p>
            </div>
            <button className="button" type="button" onClick={next}>Mijn bedrijf instellen</button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Basisgegevens</div>
            <h1>Over welk bedrijf gaat het?</h1>
            <p className="muted">We beginnen alleen met de gegevens die nodig zijn om je bedrijf correct te herkennen.</p>
            <div className="form card form-card">
              <div className="field">
                <label htmlFor="companyName">Naam bedrijf <span title="De naam waarmee jij je onderneming herkent.">ⓘ</span></label>
                <input className="input" id="companyName" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="bv. Mijn Webshop" />
              </div>
              <div className="field">
                <label htmlFor="enterpriseNumber">Ondernemingsnummer <span title="Je unieke nummer in de Kruispuntbank van Ondernemingen.">ⓘ</span></label>
                <input className="input" id="enterpriseNumber" inputMode="numeric" value={form.enterpriseNumber} onChange={(e) => update("enterpriseNumber", e.target.value)} placeholder="bv. 0123.456.789" />
                <button className="text-button align-left" type="button" onClick={() => setNotice("Je vindt dit nummer op officiële bedrijfsdocumenten en in de Kruispuntbank van Ondernemingen. We kunnen dit later verder controleren.")}>Ik weet dit niet</button>
              </div>
              <div className="field">
                <label htmlFor="startDate">Startdatum onderneming <span title="Helpt bepalen welke periodes relevant kunnen zijn.">ⓘ</span></label>
                <input className="input" id="startDate" type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} />
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Type onderneming</div>
            <h1>Hoe is je onderneming georganiseerd?</h1>
            <div className="section-block">
              <div className="field-title">Eenmanszaak of vennootschap? ⓘ</div>
              <div className="choice-grid">
                <Choice active={form.legalForm === "sole_prop"} onClick={() => update("legalForm", "sole_prop")}><strong>Eenmanszaak</strong><span>Jij en je zaak zijn juridisch sterk verbonden.</span></Choice>
                <Choice active={form.legalForm === "company"} onClick={() => update("legalForm", "company")}><strong>Vennootschap</strong><span>Je onderneming is een aparte juridische entiteit, bv. een BV.</span></Choice>
              </div>
            </div>
            <div className="section-block">
              <div className="field-title">Hoofdberoep of bijberoep? ⓘ</div>
              <div className="choice-grid">
                <Choice active={form.occupationStatus === "main"} onClick={() => update("occupationStatus", "main")}><strong>Hoofdberoep</strong><span>Je zelfstandige activiteit is je hoofdactiviteit.</span></Choice>
                <Choice active={form.occupationStatus === "side"} onClick={() => update("occupationStatus", "side")}><strong>Bijberoep</strong><span>Je zelfstandige activiteit loopt naast een andere hoofdactiviteit.</span></Choice>
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Btw</div>
            <h1>Wat weet je over je btw-status?</h1>
            <p className="muted">We vullen dit nooit zelf in op basis van een gok.</p>
            <div className="section-block">
              <div className="field-title">Ben je btw-plichtig? ⓘ</div>
              <div className="verification-guide" role="note">
                <strong>Niet zeker? Zo controleer je het officieel.</strong>
                <ol>
                  <li>Zoek je ondernemingsnummer gratis op in de <a href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl" target="_blank" rel="noreferrer">KBO Public Search</a>.</li>
                  <li>Kijk bij <strong>Hoedanigheden</strong>. Staat daar <strong>“Onderworpen aan btw”</strong>, dan is je onderneming bij de btw geregistreerd.</li>
                  <li>Je kunt de geldigheid van je btw-nummer ook controleren via de officiële <a href="https://financien.belgium.be/nl/ondernemingen/btw/internationaal/europees-btw-nummer-controleren" target="_blank" rel="noreferrer">FOD Financiën-pagina voor btw-nummercontrole</a>.</li>
                </ol>
                <p>Let op: btw-plichtig zijn betekent niet automatisch dat je op elke factuur btw moet aanrekenen. Er bestaan vrijstellingen en bijzondere regelingen. Kies daarom <strong>Ik weet het niet</strong> als je twijfelt. Dan tonen we geen definitieve btw-deadlines tot dit bevestigd is.</p>
              </div>
              <div className="choice-grid three">
                <Choice active={form.vatStatus === "yes"} onClick={() => update("vatStatus", "yes")}><strong>Ja</strong><span>Ik weet dat mijn onderneming btw-plichtig is.</span></Choice>
                <Choice active={form.vatStatus === "no"} onClick={() => update("vatStatus", "no")}><strong>Nee</strong><span>Ik weet dat mijn onderneming niet btw-plichtig is.</span></Choice>
                <Choice active={form.vatStatus === "unknown"} onClick={() => update("vatStatus", "unknown")}><strong>Ik weet het niet</strong><span>We tonen voorlopig geen definitieve btw-deadlines.</span></Choice>
              </div>
            </div>
            <div className="field">
              <label htmlFor="vatFrequency">Hoe vaak doe je btw-aangifte? ⓘ</label>
              <select className="input" id="vatFrequency" value={form.vatFrequency} onChange={(e) => update("vatFrequency", e.target.value)}>
                <option value="">Kies een antwoord</option>
                <option value="monthly">Maandelijks</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="not_applicable">Niet van toepassing / vrijgesteld</option>
                <option value="unknown">Ik weet het niet</option>
              </select>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Activiteit</div>
            <h1>Wat doet je bedrijf?</h1>
            <div className="form card form-card">
              <div className="field">
                <label htmlFor="activity">Welke activiteit? ⓘ</label>
                <textarea className="input textarea" id="activity" value={form.activity} onChange={(e) => update("activity", e.target.value)} placeholder="bv. webshop met kleding, elektricien, consultant, kapper" />
                <div className="info">Schrijf dit in je eigen woorden. Je originele omschrijving blijft bewaard.</div>
              </div>
              <div className="field">
                <label htmlFor="sells">Verkoop je producten, diensten of beide? ⓘ</label>
                <select className="input" id="sells" value={form.sells} onChange={(e) => update("sells", e.target.value)}>
                  <option value="">Kies een antwoord</option>
                  <option value="products">Producten</option>
                  <option value="services">Diensten</option>
                  <option value="both">Beide</option>
                </select>
              </div>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Personeel</div>
            <h1>Werk je alleen of met personeel?</h1>
            <p className="muted">Dit helpt bepalen welke administratieve onderwerpen later relevant kunnen zijn.</p>
            <div className="choice-grid three">
              <Choice active={form.employeeStatus === "solo"} onClick={() => update("employeeStatus", "solo")}><strong>Ik werk alleen</strong><span>Er zijn geen werknemers in dienst.</span></Choice>
              <Choice active={form.employeeStatus === "employees"} onClick={() => update("employeeStatus", "employees")}><strong>Met personeel</strong><span>Mijn onderneming heeft werknemers.</span></Choice>
              <Choice active={form.employeeStatus === "unknown"} onClick={() => update("employeeStatus", "unknown")}><strong>Ik weet het niet</strong><span>We houden hier rekening mee als ontbrekende informatie.</span></Choice>
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Controle</div>
            <h1>Dit weten we over je bedrijf.</h1>
            <p className="muted">Controleer de samenvatting. Onbekende gegevens worden niet stilletjes ingevuld.</p>
            {missing > 0 ? <div className="notice">We missen nog {missing} {missing === 1 ? "gegeven" : "gegevens"}. Daardoor kunnen sommige toekomstige deadlines of schattingen nog niet betrouwbaar zijn.</div> : null}
            <div className="summary-card card">
              {[
                ["Bedrijf", form.companyName], ["Ondernemingsnummer", form.enterpriseNumber], ["Startdatum", form.startDate], ["Rechtsvorm", form.legalForm], ["Hoofd/bijberoep", form.occupationStatus], ["Btw-status", form.vatStatus], ["Btw-frequentie", form.vatFrequency], ["Activiteit", form.activity], ["Verkoop", form.sells], ["Personeel", form.employeeStatus],
              ].map(([label, value]) => <div className="summary-row" key={label}><span>{label}</span><strong>{value || "Nog niet ingevuld"}</strong></div>)}
            </div>
            <button className="button" type="button" onClick={() => router.push("/dashboard")}>Start mijn dashboard</button>
          </section>
        ) : null}

        {notice ? <div className="notice onboarding-notice" role="status">{notice}</div> : null}

        {step > 0 && step < steps.length - 1 ? (
          <div className="onboarding-actions">
            <button className="button secondary" type="button" onClick={() => { setNotice(null); setStep((current) => Math.max(0, current - 1)); }}>Terug</button>
            <button className="button" type="button" onClick={next}>Volgende</button>
          </div>
        ) : null}
        {step === steps.length - 1 ? <button className="text-button" type="button" onClick={() => setStep(5)}>Vorige stap aanpassen</button> : null}
      </section>
    </main>
  );
}
