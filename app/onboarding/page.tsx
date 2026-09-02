"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

type HelpDetailsProps = {
  title?: string;
  meaning: string;
  why: string;
  check: React.ReactNode;
  example?: string;
  unknown: string;
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

const summaryLabels: Record<string, string> = {
  sole_prop: "Eenmanszaak",
  company: "Vennootschap",
  main: "Hoofdberoep",
  side: "Bijberoep",
  yes: "Ja",
  no: "Nee",
  unknown: "Nog niet bevestigd",
  monthly: "Maandelijks",
  quarterly: "Per kwartaal",
  not_applicable: "Niet van toepassing / vrijgesteld",
  products: "Producten",
  services: "Diensten",
  both: "Producten en diensten",
  solo: "Ik werk alleen",
  employees: "Met personeel",
};

function Choice({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`choice-card${active ? " active" : ""}`} onClick={onClick}>{children}</button>;
}

function HelpDetails({ title = "Uitleg en controleren", meaning, why, check, example, unknown }: HelpDetailsProps) {
  return (
    <details className="help-details">
      <summary>{title}</summary>
      <div className="help-details-body">
        <div><strong>Wat is dit?</strong><p>{meaning}</p></div>
        <div><strong>Waarom vragen we dit?</strong><p>{why}</p></div>
        <div><strong>Hoe controleer ik dit?</strong><div className="help-copy">{check}</div></div>
        {example ? <div><strong>Voorbeeld</strong><p>{example}</p></div> : null}
        <div><strong>Wat als ik het niet weet?</strong><p>{unknown}</p></div>
      </div>
    </details>
  );
}

function OfficialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="official-link" href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function displayValue(value: string) {
  if (!value) return "Nog niet ingevuld";
  return summaryLabels[value] ?? value;
}

function nullableValue(value: string) {
  return !value || value === "unknown" ? null : value;
}

function normalizeEnterpriseNumber(value: string) {
  if (!value || value === "unknown") return null;
  return value.replace(/\D/g, "");
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingSavedData, setLoadingSavedData] = useState(true);
  const [saving, setSaving] = useState(false);

  const unresolved = useMemo(
    () => Object.entries(form).filter(([key, value]) => {
      if (!value || value === "unknown") return true;
      if (key === "enterpriseNumber" && value === "unknown") return true;
      if (key === "startDate" && value === "unknown") return true;
      return false;
    }).length,
    [form],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSavedCompany() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        const { data: membership, error: membershipError } = await supabase
          .from("company_members")
          .select("company_id, created_at")
          .eq("user_id", userData.user.id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membership?.company_id) return;

        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("name, enterprise_number, start_date, legal_form, occupation_status, vat_status, vat_frequency, activity_description_raw, sells_products_services, employee_status")
          .eq("id", membership.company_id)
          .single();

        if (companyError) throw companyError;
        if (cancelled) return;

        setForm({
          companyName: company.name ?? "",
          enterpriseNumber: company.enterprise_number ?? "unknown",
          startDate: company.start_date ?? "unknown",
          legalForm: company.legal_form ?? "unknown",
          occupationStatus: company.occupation_status ?? "unknown",
          vatStatus: company.vat_status ?? "unknown",
          vatFrequency: company.vat_frequency ?? "unknown",
          activity: company.activity_description_raw ?? "unknown",
          sells: company.sells_products_services ?? "unknown",
          employeeStatus: company.employee_status ?? "unknown",
        });
        setNotice("Je eerder opgeslagen bedrijfsgegevens zijn geladen. Je kunt ze controleren of aanpassen.");
      } catch {
        if (!cancelled) {
          setNotice("We konden je opgeslagen bedrijfsgegevens niet betrouwbaar laden. Probeer opnieuw voordat je belangrijke gegevens aanpast.");
        }
      } finally {
        if (!cancelled) setLoadingSavedData(false);
      }
    }

    void loadSavedCompany();
    return () => { cancelled = true; };
  }, [router]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function markUnknown(key: keyof FormState, message: string) {
    update(key, "unknown");
    setNotice(message);
  }

  function next() {
    if (step === 1 && !form.companyName.trim()) {
      setNotice("Vul een naam in waarmee jij je bedrijf herkent. De officiële naam kun je later nog controleren.");
      return;
    }
    setNotice(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function saveOnboarding() {
    if (saving || loadingSavedData) return;

    const companyName = form.companyName.trim();
    if (!companyName) {
      setNotice("Vul eerst een bedrijfsnaam in. Zonder naam kunnen we je bedrijfsprofiel niet veilig opslaan.");
      setStep(1);
      return;
    }

    const enterpriseNumber = normalizeEnterpriseNumber(form.enterpriseNumber);
    if (enterpriseNumber && enterpriseNumber.length !== 10) {
      setNotice("Een Belgisch ondernemingsnummer moet 10 cijfers bevatten. Controleer het nummer in de KBO of kies ‘Ik weet dit niet’. ");
      setStep(1);
      return;
    }

    setSaving(true);
    setNotice("Je bedrijfsgegevens worden veilig opgeslagen…");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("company_members")
        .select("company_id, created_at")
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      let companyId = membership?.company_id ?? null;
      if (!companyId) {
        const { data: createdCompanyId, error: createError } = await supabase.rpc("create_company_with_owner", {
          company_name: companyName,
          enterprise_no: enterpriseNumber,
        });
        if (createError || !createdCompanyId) throw createError ?? new Error("Company creation failed");
        companyId = createdCompanyId;
      }

      const payload = {
        name: companyName,
        enterprise_number: enterpriseNumber,
        start_date: nullableValue(form.startDate),
        legal_form: nullableValue(form.legalForm),
        occupation_status: nullableValue(form.occupationStatus),
        vat_status: nullableValue(form.vatStatus),
        vat_frequency: nullableValue(form.vatFrequency),
        activity_description_raw: nullableValue(form.activity),
        sells_products_services: nullableValue(form.sells),
        employee_status: nullableValue(form.employeeStatus),
        profile_status: unresolved === 0 ? "complete" : "incomplete",
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", companyId);

      if (updateError) throw updateError;

      const { data: savedCompany, error: verifyError } = await supabase
        .from("companies")
        .select("id, name, profile_status")
        .eq("id", companyId)
        .single();

      if (verifyError || !savedCompany) throw verifyError ?? new Error("Saved company could not be verified");

      setNotice("Opgeslagen. Je bedrijfsgegevens blijven nu bewaard wanneer je uitlogt en later terugkomt.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setNotice("Opslaan is niet gelukt. Er is niets als bevestigd voorgesteld. Probeer opnieuw; als dit blijft gebeuren, controleer dan de verbinding met je veilige bedrijfsdatabase.");
    } finally {
      setSaving(false);
    }
  }

  const summaryRows: Array<[string, string, number]> = [
    ["Bedrijf", form.companyName, 1],
    ["Ondernemingsnummer", form.enterpriseNumber, 1],
    ["Startdatum", form.startDate, 1],
    ["Rechtsvorm", form.legalForm, 2],
    ["Hoofd/bijberoep", form.occupationStatus, 2],
    ["Btw-status", form.vatStatus, 3],
    ["Btw-frequentie", form.vatFrequency, 3],
    ["Activiteit", form.activity, 4],
    ["Verkoop", form.sells, 4],
    ["Personeel", form.employeeStatus, 5],
  ];

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
            <p className="hero-copy">Je hoeft niets van boekhouden of administratie te kennen. Bij elke vraag leggen we uit wat ze betekent, waarom we ze stellen en hoe je het antwoord kunt controleren.</p>
            <div className="card trust-panel">
              <strong>Je hoeft nooit te gokken.</strong>
              <p className="muted">Weet je iets niet? Kies dan veilig voor “Ik weet het niet”. Belangrijke fiscale of juridische informatie behandelen we pas als bevestigd wanneer daar voldoende bewijs voor is.</p>
            </div>
            <button className="button" type="button" onClick={next} disabled={loadingSavedData}>{loadingSavedData ? "Opgeslagen gegevens laden…" : "Mijn bedrijf instellen"}</button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Basisgegevens</div>
            <h1>Over welk bedrijf gaat het?</h1>
            <p className="muted">We beginnen met drie gegevens waarmee we je onderneming correct kunnen herkennen.</p>
            <div className="form card form-card">
              <div className="field">
                <label htmlFor="companyName">Naam bedrijf</label>
                <input className="input" id="companyName" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="bv. Mijn Webshop" />
                <HelpDetails
                  meaning="De naam waarmee jij je onderneming herkent. Dit kan je officiële ondernemingsnaam zijn."
                  why="We tonen deze naam in je dashboard, documenten en instellingen zodat je altijd weet voor welk bedrijf je werkt."
                  check={<>Controleer de officiële publieke gegevens via <OfficialLink href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl">KBO Public Search</OfficialLink> van FOD Economie.</>}
                  example="Bijvoorbeeld: Janssens Consulting BV."
                  unknown="Vul voorlopig een naam in die jij herkent. We kunnen de officiële naam later naast je ondernemingsnummer controleren."
                />
              </div>

              <div className="field">
                <label htmlFor="enterpriseNumber">Ondernemingsnummer</label>
                <input
                  className="input"
                  id="enterpriseNumber"
                  inputMode="numeric"
                  value={form.enterpriseNumber === "unknown" ? "" : form.enterpriseNumber}
                  onChange={(e) => update("enterpriseNumber", e.target.value)}
                  placeholder={form.enterpriseNumber === "unknown" ? "Nog niet bevestigd" : "bv. 0123.456.789"}
                />
                <HelpDetails
                  meaning="Het unieke Belgische nummer van 10 cijfers waarmee je onderneming in de KBO wordt geïdentificeerd."
                  why="Dit is de veiligste basis om je onderneming te koppelen aan officiële bedrijfsgegevens."
                  check={<>Zoek op naam of adres in <OfficialLink href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl">KBO Public Search</OfficialLink>. FOD Economie bevestigt dat een ondernemingsnummer uit 10 cijfers bestaat.</>}
                  example="Bijvoorbeeld: 0123.456.789."
                  unknown="Kies hieronder “Ik weet dit niet”. We bewaren dit als onbevestigd en gebruiken het niet als officiële waarheid."
                />
                <button className="text-button align-left" type="button" onClick={() => markUnknown("enterpriseNumber", "Ondernemingsnummer staat als onbevestigd. Je kunt veilig verder en dit later controleren in de KBO.")}>Ik weet dit niet</button>
              </div>

              <div className="field">
                <label htmlFor="startDate">Startdatum onderneming</label>
                <input
                  className="input"
                  id="startDate"
                  type="date"
                  value={form.startDate === "unknown" ? "" : form.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                />
                <HelpDetails
                  meaning="De datum waarop je onderneming officieel gestart is."
                  why="Zo weten we vanaf welke periode administratie en mogelijke verplichtingen relevant kunnen zijn."
                  check={<>Controleer je ondernemingsgegevens in <OfficialLink href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl">KBO Public Search</OfficialLink> of je officiële oprichtings-/inschrijvingsdocumenten. Als je meerdere datums ziet en twijfelt welke we nodig hebben, markeer dit als onbekend.</>}
                  example="Als je onderneming officieel begon op 15 maart 2026, vul je 15/03/2026 in."
                  unknown="Kies “Ik weet dit niet”. Dan gebruiken we de datum niet voor definitieve deadlines tot ze bevestigd is."
                />
                <button className="text-button align-left" type="button" onClick={() => markUnknown("startDate", "Startdatum staat als onbevestigd. We maken daar geen definitieve deadline uit zolang dit niet gecontroleerd is.")}>Ik weet dit niet</button>
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Type onderneming</div>
            <h1>Hoe is je onderneming georganiseerd?</h1>

            <div className="section-block">
              <div className="field-title">Eenmanszaak of vennootschap?</div>
              <HelpDetails
                meaning="Een eenmanszaak is juridisch gekoppeld aan jou als natuurlijke persoon. Een vennootschap is een aparte juridische structuur, bijvoorbeeld een BV."
                why="Je rechtsvorm kan beïnvloeden welke administratie, belastingen en documenten relevant zijn."
                check={<>Controleer je juridische vorm in <OfficialLink href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl">KBO Public Search</OfficialLink>. FOD Economie legt ook de verschillende opstartstappen uit voor een <OfficialLink href="https://economie.fgov.be/nl/themas/ondernemingen/een-onderneming-oprichten/belangrijkste-stappen-om-een/te-ondernemen-stappen-bij-een">eenmanszaak en vennootschap</OfficialLink>.</>}
                example="Een zelfstandige zonder aparte vennootschap werkt meestal als eenmanszaak. Een BV is een vennootschap."
                unknown="Kies “Ik weet het niet”. We houden de rechtsvorm dan onbevestigd en tonen geen regels die hiervan afhangen als zekerheid."
              />
              <div className="choice-grid three">
                <Choice active={form.legalForm === "sole_prop"} onClick={() => update("legalForm", "sole_prop")}><strong>Eenmanszaak</strong><span>Ik werk als natuurlijke persoon.</span></Choice>
                <Choice active={form.legalForm === "company"} onClick={() => update("legalForm", "company")}><strong>Vennootschap</strong><span>Mijn onderneming is bijvoorbeeld een BV.</span></Choice>
                <Choice active={form.legalForm === "unknown"} onClick={() => update("legalForm", "unknown")}><strong>Ik weet het niet</strong><span>We behandelen dit voorlopig als onbevestigd.</span></Choice>
              </div>
            </div>

            <div className="section-block">
              <div className="field-title">Hoofdberoep of bijberoep?</div>
              <HelpDetails
                meaning="Dit gaat over je sociaal statuut als zelfstandige. Bijberoep betekent dat je zelfstandige activiteit naast een andere hoofdactiviteit of bepaalde vervangingsinkomsten loopt."
                why="Je sociaal statuut beïnvloedt onder andere de manier waarop sociale bijdragen en sommige verplichtingen worden beoordeeld."
                check={<>Je sociaal verzekeringsfonds kan je officiële statuut bevestigen. Het <OfficialLink href="https://www.rsvz.be/nl/zelfstandige-bijberoep">RSVZ legt uit wanneer je zelfstandige in bijberoep bent</OfficialLink>.</>}
                example="Werk je voldoende als werknemer en heb je daarnaast een zelfstandige activiteit, dan kun je onder voorwaarden zelfstandige in bijberoep zijn."
                unknown="Kies “Ik weet het niet”. Vraag je sociaal verzekeringsfonds om bevestiging voordat we hier belangrijke conclusies aan koppelen."
              />
              <div className="choice-grid three">
                <Choice active={form.occupationStatus === "main"} onClick={() => update("occupationStatus", "main")}><strong>Hoofdberoep</strong><span>Mijn zelfstandige activiteit valt onder hoofdberoep.</span></Choice>
                <Choice active={form.occupationStatus === "side"} onClick={() => update("occupationStatus", "side")}><strong>Bijberoep</strong><span>Mijn zelfstandige activiteit valt onder bijberoep.</span></Choice>
                <Choice active={form.occupationStatus === "unknown"} onClick={() => update("occupationStatus", "unknown")}><strong>Ik weet het niet</strong><span>Mijn sociaal statuut is nog niet bevestigd.</span></Choice>
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Btw</div>
            <h1>Wat weet je over je btw-status?</h1>
            <p className="muted">Btw kan ingewikkeld zijn. We maken geen fiscale conclusie op basis van een gok.</p>

            <div className="section-block">
              <div className="field-title">Ben je btw-plichtig?</div>
              <div className="verification-guide" role="note">
                <strong>Niet zeker? Controleer dit eerst.</strong>
                <ol>
                  <li>Zoek je ondernemingsnummer op in de <OfficialLink href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl">KBO Public Search</OfficialLink>.</li>
                  <li>Kijk bij je publieke hoedanigheden en btw-gegevens.</li>
                  <li>Als je situatie niet duidelijk is, kies hier “Ik weet het niet”.</li>
                </ol>
                <p>Een btw-nummer of btw-registratie betekent niet automatisch dat elke factuur op dezelfde manier met btw wordt behandeld. Vrijstellingen en bijzondere regelingen bestaan.</p>
              </div>
              <HelpDetails
                meaning="Btw-plichtig betekent dat je onderneming onder de Belgische btw-regels valt. De precieze regeling kan verschillen."
                why="Je btw-status bepaalt welke btw-informatie, aangiften en deadlines mogelijk relevant zijn."
                check={<>Controleer eerst de publieke bedrijfsgegevens via de KBO. Voor aangiften en je eigen btw-dossier is <OfficialLink href="https://financien.belgium.be/nl/E-services/Intervat">Intervat van FOD Financiën</OfficialLink> de officiële toepassing. Bij twijfel kan je accountant of bevoegde btw-dienst je regime bevestigen.</>}
                example="Een onderneming kan een btw-nummer hebben maar onder een vrijstellingsregeling vallen. Daarom vragen we status en aangifteritme apart."
                unknown="Kies “Ik weet het niet”. Dan tonen we geen definitieve btw-deadlines of btw-conclusies tot je status bevestigd is."
              />
              <div className="choice-grid three">
                <Choice active={form.vatStatus === "yes"} onClick={() => update("vatStatus", "yes")}><strong>Ja</strong><span>Mijn btw-status is bevestigd als btw-plichtig.</span></Choice>
                <Choice active={form.vatStatus === "no"} onClick={() => update("vatStatus", "no")}><strong>Nee</strong><span>Mijn btw-status is bevestigd als niet btw-plichtig.</span></Choice>
                <Choice active={form.vatStatus === "unknown"} onClick={() => update("vatStatus", "unknown")}><strong>Ik weet het niet</strong><span>We tonen voorlopig geen definitieve btw-deadlines.</span></Choice>
              </div>
            </div>

            <div className="field">
              <label htmlFor="vatFrequency">Hoe vaak doe je een periodieke btw-aangifte?</label>
              <select className="input" id="vatFrequency" value={form.vatFrequency} onChange={(e) => update("vatFrequency", e.target.value)}>
                <option value="">Kies een antwoord</option>
                <option value="monthly">Maandelijks</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="not_applicable">Niet van toepassing / vrijgesteld</option>
                <option value="unknown">Ik weet het niet</option>
              </select>
              <HelpDetails
                meaning="Dit is het ritme waarmee je gewone periodieke btw-aangiften indient: per maand, per kwartaal, of niet volgens dit regime."
                why="We hebben dit nodig om later alleen deadlines te tonen die bij jouw echte aangifteritme passen."
                check={<>Open je eerdere aangiften in <OfficialLink href="https://financien.belgium.be/nl/E-services/Intervat">Intervat / MyMinfin</OfficialLink>. De aangifteperiodes tonen of je maandelijks of per kwartaal indient. FOD Financiën bevestigt dat de regels en deadlines per regime verschillen.</>}
                example="Als je aangiften Q1, Q2, Q3 en Q4 ziet, dien je per kwartaal in. Zie je elke maand een aparte periode, dan is het maandelijks."
                unknown="Kies “Ik weet het niet”. We berekenen dan geen definitieve btw-deadline totdat je aangifteritme bevestigd is."
              />
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Activiteit</div>
            <h1>Wat doet je bedrijf?</h1>
            <div className="form card form-card">
              <div className="field">
                <label htmlFor="activity">Welke activiteit doe je?</label>
                <textarea className="input textarea" id="activity" value={form.activity === "unknown" ? "" : form.activity} onChange={(e) => update("activity", e.target.value)} placeholder="bv. webshop met kleding, elektricien, consultant, kapper" />
                <HelpDetails
                  meaning="Beschrijf in gewone woorden waarmee je onderneming geld verdient of welke activiteit je uitvoert. Je hoeft geen officiële code te kennen."
                  why="Zo kunnen we uitleg, categorieën en mogelijke administratieve onderwerpen beter op jouw bedrijf afstemmen."
                  check={<>Je geregistreerde activiteiten kun je bekijken via <OfficialLink href="https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl">KBO Public Search</OfficialLink>. Vul hier vooral in wat je vandaag werkelijk doet, in je eigen woorden.</>}
                  example="Bijvoorbeeld: “Ik plaats zonnepanelen bij particulieren” of “Ik verkoop kleding via een webshop”."
                  unknown="Kies “Ik weet dit niet” als je bedrijf nog niet gestart is of je activiteit nog niet vastligt. We behandelen de activiteit dan als onvolledig."
                />
                <button className="text-button align-left" type="button" onClick={() => markUnknown("activity", "Activiteit staat als onbevestigd. We tonen geen activiteit-specifieke verplichtingen als zekerheid zolang dit niet ingevuld is.")}>Ik weet dit niet</button>
              </div>

              <div className="field">
                <label htmlFor="sells">Verkoop je producten, diensten of beide?</label>
                <select className="input" id="sells" value={form.sells} onChange={(e) => update("sells", e.target.value)}>
                  <option value="">Kies een antwoord</option>
                  <option value="products">Producten</option>
                  <option value="services">Diensten</option>
                  <option value="both">Beide</option>
                  <option value="unknown">Ik weet het nog niet</option>
                </select>
                <HelpDetails
                  meaning="Een product is iets dat je verkoopt of levert. Een dienst is werk of expertise die je voor een klant uitvoert."
                  why="Het helpt ons later alleen relevante uitleg en factuurcontext te tonen."
                  check={<>Kijk naar wat je klanten van jou kopen. Je geregistreerde activiteiten in de KBO kunnen helpen, maar dit veld vraagt vooral naar je echte huidige aanbod.</>}
                  example="Een kledingwebshop verkoopt producten. Een consultant verkoopt diensten. Een installateur die materiaal én plaatsing factureert kan beide kiezen."
                  unknown="Kies “Ik weet het nog niet”. We houden dit als onbevestigd en baseren er geen harde regel op."
                />
              </div>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Personeel</div>
            <h1>Werk je alleen of met personeel?</h1>
            <p className="muted">Met personeel bedoelen we werknemers die officieel bij je onderneming in dienst zijn.</p>
            <HelpDetails
              meaning="We vragen of je onderneming werknemers in dienst heeft. Externe freelancers of leveranciers zijn niet automatisch personeel."
              why="Werknemers kunnen extra sociale en administratieve verplichtingen relevant maken. We tonen die niet aan bedrijven zonder personeel."
              check={<>Werkgevers geven indienst- en uitdiensttredingen aan via Dimona. In het beveiligde <OfficialLink href="https://www.socialsecurity.be/site_nl/employer/applics/dimona/general/about.htm">personeelsbestand van de Sociale Zekerheid</OfficialLink> kun je werknemers en Dimona-aangiften raadplegen.</>}
              example="Een zelfstandige die alleen werkt kiest “Ik werk alleen”. Heb je één werknemer met een arbeidsovereenkomst in dienst, kies dan “Met personeel”."
              unknown="Kies “Ik weet het niet”. We tonen dan geen personeelsverplichtingen als zekerheid tot je dit bevestigd hebt."
            />
            <div className="choice-grid three">
              <Choice active={form.employeeStatus === "solo"} onClick={() => update("employeeStatus", "solo")}><strong>Ik werk alleen</strong><span>Er zijn geen werknemers in dienst.</span></Choice>
              <Choice active={form.employeeStatus === "employees"} onClick={() => update("employeeStatus", "employees")}><strong>Met personeel</strong><span>Mijn onderneming heeft één of meer werknemers.</span></Choice>
              <Choice active={form.employeeStatus === "unknown"} onClick={() => update("employeeStatus", "unknown")}><strong>Ik weet het niet</strong><span>We behandelen personeelsstatus voorlopig als onbevestigd.</span></Choice>
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="onboarding-content">
            <div className="eyebrow">Controle</div>
            <h1>Dit weten we over je bedrijf.</h1>
            <p className="muted">Controleer alles nog één keer. “Nog niet bevestigd” is geen fout: het betekent dat we daar voorlopig geen harde conclusie uit trekken.</p>
            {unresolved > 0 ? <div className="notice">Er zijn nog {unresolved} {unresolved === 1 ? "gegeven dat" : "gegevens die"} ontbreken of niet bevestigd zijn. Daardoor kunnen sommige deadlines of schattingen nog niet betrouwbaar zijn.</div> : <div className="notice success-notice">Alle onboardinggegevens zijn ingevuld. Ze worden pas als officiële waarheid gebruikt waar dat veilig en voldoende bevestigd is.</div>}
            <div className="summary-card card">
              {summaryRows.map(([label, value, targetStep]) => (
                <div className="summary-row" key={label}>
                  <span>{label}</span>
                  <strong>{displayValue(value)}</strong>
                  <button className="text-button summary-edit" type="button" onClick={() => setStep(targetStep)}>Wijzig</button>
                </div>
              ))}
            </div>
            <button className="button" type="button" onClick={() => void saveOnboarding()} disabled={saving || loadingSavedData} aria-busy={saving}>{saving ? "Veilig opslaan…" : "Opslaan en dashboard openen"}</button>
          </section>
        ) : null}

        {notice ? <div className="notice onboarding-notice" role="status">{notice}</div> : null}

        {step > 0 && step < steps.length - 1 ? (
          <div className="onboarding-actions">
            <button className="button secondary" type="button" onClick={() => { setNotice(null); setStep((current) => Math.max(0, current - 1)); }}>Terug</button>
            <button className="button" type="button" onClick={next}>Volgende</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
