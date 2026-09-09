"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const documentTypes = [
  { value: "tax", label: "Belastingen" },
  { value: "insurance", label: "Verzekering" },
  { value: "contract", label: "Contract" },
  { value: "government", label: "Overheid" },
  { value: "other", label: "Andere" },
] as const;

type DocumentType = (typeof documentTypes)[number]["value"];

function isDocumentType(value: string | null): value is DocumentType {
  return documentTypes.some((option) => option.value === value);
}

export default function DocumentTypeControl({ documentId, currentType }: { documentId: string; currentType: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState<DocumentType | "">(isDocumentType(currentType) ? currentType : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirmType() {
    if (!value || busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("set_document_type", {
        target_document_id: documentId,
        target_document_type: value,
      });

      if (error) {
        setMessage("Het type kon niet veilig worden bevestigd. Er is niets als definitief opgeslagen.");
        return;
      }

      setMessage("Type bevestigd.");
      router.refresh();
    } catch {
      setMessage("De verbinding werd onderbroken. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="document-type-control">
      <label htmlFor={`document-type-${documentId}`}>Wat voor document is dit?</label>
      <div className="document-type-control-row">
        <select
          id={`document-type-${documentId}`}
          value={value}
          disabled={busy}
          onChange={(event) => { setValue(event.target.value as DocumentType | ""); setMessage(null); }}
        >
          <option value="">Kies een type</option>
          {documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button className="button secondary" type="button" disabled={!value || busy} onClick={() => void confirmType()}>
          {busy ? "Opslaan…" : currentType ? "Type wijzigen" : "Type bevestigen"}
        </button>
      </div>
      <span className="muted" aria-live="polite">
        {message ?? "Kies alleen wat je zelf herkent. Een factuur hoort via Facturen en kan hier niet als ander document worden bevestigd."}
      </span>
    </div>
  );
}
