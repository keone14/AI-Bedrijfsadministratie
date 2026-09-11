"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const documentTypes = [
  { value: "tax", label: "Belastingen" },
  { value: "insurance", label: "Verzekering" },
  { value: "contract", label: "Contract" },
  { value: "government", label: "Overheid" },
  { value: "other", label: "Andere" },
] as const;

type DocumentType = (typeof documentTypes)[number]["value"];
function isDocumentType(value: string | null): value is DocumentType { return documentTypes.some((option) => option.value === value); }

export default function DocumentTypeControl({ documentId, currentType }: { documentId: string; currentType: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState<DocumentType | "">(isDocumentType(currentType) ? currentType : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const confirmedValue: DocumentType | "" = isDocumentType(currentType) ? currentType : "";
  const hasChange = Boolean(value) && value !== confirmedValue;

  async function confirmType() {
    if (!value || !hasChange || busy) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/type`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: value }) });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setValue(confirmedValue);
        setMessage(result?.error ?? "Het type kon niet veilig worden bevestigd. Je vorige bevestigde keuze blijft behouden.");
        return;
      }
      setMessage("Type bevestigd.");
      router.refresh();
    } catch {
      setValue(confirmedValue);
      setMessage("De verbinding werd onderbroken. Je vorige bevestigde keuze blijft zichtbaar terwijl we de opgeslagen gegevens opnieuw laden.");
      router.refresh();
    }
    finally { setBusy(false); }
  }

  const buttonLabel = currentType ? (hasChange ? "Type wijzigen" : "Type bevestigd") : "Type bevestigen";

  return <div className="document-type-control"><label htmlFor={`document-type-${documentId}`}>Wat voor document is dit?</label><div className="document-type-control-row"><select id={`document-type-${documentId}`} value={value} disabled={busy} onChange={(event) => { setValue(event.target.value as DocumentType | ""); setMessage(null); }}><option value="">Kies een type</option>{documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button className="button secondary" type="button" disabled={!hasChange || busy} onClick={() => void confirmType()}>{busy ? "Opslaan…" : buttonLabel}</button></div><span className="muted" aria-live="polite">{message ?? "Kies alleen wat je zelf herkent. Een factuur hoort via Facturen en kan hier niet als ander document worden bevestigd."}</span></div>;
}
