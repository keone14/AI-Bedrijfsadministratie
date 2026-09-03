"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type ReviewValues = {
  documentType: "invoice" | "credit_note" | null;
  supplierName: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  vatAmount: number | null;
  total: number | null;
  currency: string | null;
  description: string | null;
  invoiceType: "purchase" | "sale" | null;
  categoryId: string | null;
};

type CategoryOption = {
  id: string;
  simple_label: string;
  description_simple: string | null;
};

type Draft = {
  documentType: "invoice" | "credit_note" | "";
  supplierName: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  currency: string;
  description: string;
  invoiceType: "purchase" | "sale" | "";
  categoryId: string;
};

type ArithmeticStatus = "incomplete" | "ok" | "mismatch" | "invalid";

type CorrectionFieldProps = {
  id: string;
  label: string;
  help: string;
  children: ReactNode;
  note?: string;
  wide?: boolean;
};

function CorrectionField({ id, label, help, children, note, wide = false }: CorrectionFieldProps) {
  return (
    <div className={`invoice-correction-field${wide ? " invoice-correction-wide" : ""}`}>
      <div className="invoice-correction-label-row">
        <label htmlFor={id}>{label}</label>
        <details className="invoice-field-help">
          <summary aria-label={`Uitleg over ${label}`}>ⓘ</summary>
          <div>{help}</div>
        </details>
      </div>
      {children}
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function toDraft(values: ReviewValues): Draft {
  return {
    documentType: values.documentType ?? "",
    supplierName: values.supplierName ?? "",
    customerName: values.customerName ?? "",
    invoiceNumber: values.invoiceNumber ?? "",
    invoiceDate: values.invoiceDate ?? "",
    dueDate: values.dueDate ?? "",
    subtotal: values.subtotal === null ? "" : String(values.subtotal),
    vatAmount: values.vatAmount === null ? "" : String(values.vatAmount),
    total: values.total === null ? "" : String(values.total),
    currency: values.currency ?? "",
    description: values.description ?? "",
    invoiceType: values.invoiceType ?? "",
    categoryId: values.categoryId ?? "",
  };
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function numberOrNull(value: string) {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) return null;
  if (Number.isNaN(parsed)) throw new Error("Controleer de bedragen. Gebruik bijvoorbeeld 121,00.");
  return parsed;
}

function arithmeticStatus(draft: Draft): ArithmeticStatus {
  const subtotal = parseOptionalNumber(draft.subtotal);
  const vat = parseOptionalNumber(draft.vatAmount);
  const total = parseOptionalNumber(draft.total);

  if ([subtotal, vat, total].some((value) => typeof value === "number" && Number.isNaN(value))) return "invalid";
  if (subtotal === null || vat === null || total === null) return "incomplete";
  return Math.abs((subtotal + vat) - total) <= 0.02 ? "ok" : "mismatch";
}

export default function InvoiceReviewActions({ invoiceId, values, categories }: { invoiceId: string; values: ReviewValues; categories: CategoryOption[] }) {
  const router = useRouter();
  const initialDraft = useMemo(() => toDraft(values), [values]);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"confirm" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const amountStatus = useMemo(() => arithmeticStatus(draft), [draft]);

  async function confirm() {
    if (busy || editing) return;
    setBusy("confirm");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/confirm`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Bevestiging mislukt.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bevestiging mislukt.");
    } finally {
      setBusy(null);
    }
  }

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleEditing() {
    setError(null);
    setNotice(null);
    if (editing) {
      setDraft(toDraft(values));
      setEditing(false);
      return;
    }
    setDraft(toDraft(values));
    setEditing(true);
  }

  async function saveCorrections() {
    if (busy) return;
    setError(null);
    setNotice(null);

    try {
      if (amountStatus === "invalid") throw new Error("Controleer de bedragen. Gebruik bijvoorbeeld 121,00.");
      if (amountStatus === "mismatch") throw new Error("Bedrag zonder btw + btw komt niet overeen met het totaal. Controleer deze drie bedragen eerst.");

      const nextValues: ReviewValues = {
        documentType: draft.documentType || null,
        supplierName: draft.supplierName.trim() || null,
        customerName: draft.customerName.trim() || null,
        invoiceNumber: draft.invoiceNumber.trim() || null,
        invoiceDate: draft.invoiceDate || null,
        dueDate: draft.dueDate || null,
        subtotal: numberOrNull(draft.subtotal),
        vatAmount: numberOrNull(draft.vatAmount),
        total: numberOrNull(draft.total),
        currency: draft.currency.trim() ? draft.currency.trim().toUpperCase() : null,
        description: draft.description.trim() || null,
        invoiceType: draft.invoiceType || null,
        categoryId: draft.categoryId || null,
      };

      const corrections: Record<string, string | number | null> = {};
      for (const key of Object.keys(nextValues) as Array<keyof ReviewValues>) {
        if (nextValues[key] !== values[key]) corrections[key] = nextValues[key];
      }
      if (!Object.keys(corrections).length) throw new Error("Je hebt nog niets aangepast.");

      setBusy("save");
      const response = await fetch(`/api/invoices/${invoiceId}/correct`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corrections),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "De aanpassingen konden niet worden opgeslagen.");

      setDraft(toDraft(nextValues));
      setNotice(body.message ?? "Je aanpassingen zijn veilig opgeslagen.");
      setEditing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "De aanpassingen konden niet worden opgeslagen.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="invoice-review-block">
      <div className="invoice-review-actions">
        <button className="button" type="button" disabled={Boolean(busy) || editing} onClick={confirm}>
          {busy === "confirm" ? "Bevestigen..." : "Ja, dit klopt"}
        </button>
        <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={toggleEditing}>
          {editing ? "Annuleren" : "Aanpassen"}
        </button>
        <span className="muted">{editing ? "Sla je wijzigingen eerst op. Pas daarna kun je de factuur bevestigen." : "Bevestig alleen als de gegevens kloppen. Aanpassingen worden apart bijgehouden; de oorspronkelijke AI-uitlezing blijft bestaan."}</span>
      </div>

      {editing ? (
        <div className="invoice-correction-panel">
          <div className="invoice-correction-intro">
            <strong>Pas alleen aan wat fout of onduidelijk is</strong>
            <span>Leeg laten betekent dat het gegeven niet betrouwbaar bekend is. Je correctie wordt als apart auditspoor bewaard en overschrijft de oorspronkelijke AI-uitlezing niet.</span>
          </div>

          <div className="invoice-correction-grid">
            <CorrectionField id="correction-document-type" label="Documenttype" help="Een factuur vraagt betaling voor een aankoop of verkoop. Een creditnota corrigeert een eerdere factuur. Zie je het niet duidelijk op het document? Kies ‘Niet zeker’.">
              <select id="correction-document-type" value={draft.documentType} onChange={(event) => update("documentType", event.target.value as Draft["documentType"])}><option value="">Niet zeker</option><option value="invoice">Factuur</option><option value="credit_note">Creditnota</option></select>
            </CorrectionField>
            <CorrectionField id="correction-invoice-type" label="Aankoop of verkoop" help="Aankoop betekent dat jouw bedrijf de factuur ontvangt van een leverancier. Verkoop betekent dat jouw bedrijf de factuur aan een klant stuurt. Twijfel je? Kies ‘Niet zeker’.">
              <select id="correction-invoice-type" value={draft.invoiceType} onChange={(event) => update("invoiceType", event.target.value as Draft["invoiceType"])}><option value="">Niet zeker</option><option value="purchase">Aankoop</option><option value="sale">Verkoop</option></select>
            </CorrectionField>
            <CorrectionField id="correction-category" label="Categorie" help="Dit is een eenvoudige groep voor je overzicht, zoals Software of Auto. Je mag het voorstel corrigeren. Twijfel je welke groep past? Kies ‘Niet zeker’." note="Corrigeer je de categorie, dan onthouden we die keuze voor deze leverancier binnen jouw bedrijf.">
              <select id="correction-category" value={draft.categoryId} onChange={(event) => update("categoryId", event.target.value)}><option value="">Niet zeker</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.simple_label}</option>)}</select>
            </CorrectionField>
            <CorrectionField id="correction-supplier" label="Leverancier" help="Het bedrijf dat het product of de dienst levert en meestal de factuur opstelt. Kijk bij de afzender of bedrijfsnaam. Niet duidelijk? Laat dit veld leeg.">
              <input id="correction-supplier" value={draft.supplierName} maxLength={500} onChange={(event) => update("supplierName", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-customer" label="Klant" help="Het bedrijf of de persoon voor wie de factuur bedoeld is. Kijk bij ‘klant’, ‘aan’ of het adresblok. Niet duidelijk? Laat dit veld leeg.">
              <input id="correction-customer" value={draft.customerName} maxLength={500} onChange={(event) => update("customerName", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-invoice-number" label="Factuurnummer" help="De unieke referentie die de opsteller aan deze factuur gaf. Vaak staat ze bovenaan bij ‘factuurnummer’, ‘invoice number’ of ‘nr.’. Verzin geen nummer: laat leeg als je het niet ziet.">
              <input id="correction-invoice-number" value={draft.invoiceNumber} maxLength={200} onChange={(event) => update("invoiceNumber", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-currency" label="Valuta" help="De munt waarin de bedragen staan, bijvoorbeeld EUR. Kijk bij de bedragen of betalingsgegevens. Niet zeker? Laat dit veld leeg.">
              <input id="correction-currency" value={draft.currency} maxLength={3} placeholder="EUR" onChange={(event) => update("currency", event.target.value.toUpperCase())} />
            </CorrectionField>
            <CorrectionField id="correction-invoice-date" label="Factuurdatum" help="De datum waarop de factuur is opgesteld. Kijk meestal bovenaan bij ‘datum’ of ‘factuurdatum’. Niet duidelijk? Laat dit veld leeg.">
              <input id="correction-invoice-date" type="date" value={draft.invoiceDate} onChange={(event) => update("invoiceDate", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-due-date" label="Vervaldatum" help="De datum tegen wanneer de opsteller vraagt te betalen. Kijk bij ‘vervaldatum’ of ‘due date’. Staat ze niet duidelijk op het document? Laat dit veld leeg.">
              <input id="correction-due-date" type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-subtotal" label="Bedrag zonder btw" help="Het bedrag vóór de apart vermelde btw. Kijk naar een regel zoals ‘excl. btw’ of ‘subtotaal’. Als het document dit niet duidelijk toont, laat dit veld leeg.">
              <input id="correction-subtotal" inputMode="decimal" value={draft.subtotal} placeholder="100,00" onChange={(event) => update("subtotal", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-vat" label="Btw" help="Het btw-bedrag dat op deze factuur apart vermeld staat. Neem alleen over wat je op het document ziet. Niet duidelijk? Laat dit veld leeg.">
              <input id="correction-vat" inputMode="decimal" value={draft.vatAmount} placeholder="21,00" onChange={(event) => update("vatAmount", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-total" label="Totaal" help="Het volledige totaal dat op de factuur staat. Kijk naar ‘totaal’ of ‘te betalen’. Zijn meerdere totalen onduidelijk? Laat dit veld leeg en controleer het document.">
              <input id="correction-total" inputMode="decimal" value={draft.total} placeholder="121,00" onChange={(event) => update("total", event.target.value)} />
            </CorrectionField>
            <CorrectionField id="correction-description" label="Omschrijving" help="Een korte beschrijving van wat gekocht of verkocht werd. Neem de hoofdactiviteit of belangrijkste factuurregel over. Niet duidelijk? Laat dit veld leeg." wide>
              <textarea id="correction-description" value={draft.description} maxLength={2000} rows={3} onChange={(event) => update("description", event.target.value)} />
            </CorrectionField>
          </div>

          {amountStatus === "mismatch" ? (
            <div className="invoice-read-warning" role="status" aria-live="polite"><strong>De bedragen tellen niet helemaal op.</strong><span>Bedrag zonder btw + btw moet ongeveer gelijk zijn aan het totaal. Controleer deze drie bedragen voordat je opslaat.</span></div>
          ) : amountStatus === "invalid" ? (
            <div className="invoice-read-warning" role="status" aria-live="polite"><strong>Controleer de ingevoerde bedragen.</strong><span>Gebruik alleen cijfers, bijvoorbeeld 121,00.</span></div>
          ) : null}

          <div className="invoice-correction-footer">
            <button className="button" type="button" disabled={Boolean(busy) || amountStatus === "mismatch" || amountStatus === "invalid"} onClick={saveCorrections}>{busy === "save" ? "Veilig opslaan..." : "Aanpassingen opslaan"}</button>
            <span className="muted">Na opslaan blijft de factuur op ‘Controle nodig’ totdat je ze expliciet bevestigt.</span>
          </div>
        </div>
      ) : null}

      {notice ? <span className="invoice-action-success" role="status">{notice}</span> : null}
      {error ? <span className="invoice-action-error" role="alert">{error}</span> : null}
    </div>
  );
}
