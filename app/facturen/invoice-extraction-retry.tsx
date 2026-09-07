"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ExtractionResponse = {
  error?: string;
  code?: string;
};

export default function InvoiceExtractionRetry({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    if (busy) return;

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/extract`, {
        method: "POST",
      });
      const result = await response.json() as ExtractionResponse;

      if (response.status === 202) {
        setMessage("Opnieuw gestart. Je factuur wordt nu veilig uitgelezen.");
        router.refresh();
        return;
      }

      if (result.code === "AI_NOT_CONFIGURED") {
        setMessage("Automatisch uitlezen is nu niet beschikbaar. Je originele factuur blijft veilig bewaard.");
        return;
      }

      setMessage(result.error ?? "Opnieuw uitlezen lukte nu niet. Je factuur blijft veilig bewaard.");
    } catch {
      setMessage("De verbinding werd onderbroken. Probeer opnieuw wanneer je verbinding stabiel is.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="button secondary" type="button" disabled={busy} onClick={() => void retry()}>
        {busy ? "Opnieuw proberen..." : "Opnieuw uitlezen"}
      </button>
      {message ? <span role="status" aria-live="polite">{message}</span> : null}
    </div>
  );
}
