"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ExtractionResponse = {
  error?: string;
  code?: string;
};

function retryWaitLabel(seconds: number) {
  if (seconds <= 60) return `${Math.max(1, seconds)} sec`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

export default function InvoiceExtractionRetry({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  async function retry() {
    if (busy || retryAfterSeconds > 0) return;

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/extract`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({} as ExtractionResponse)) as ExtractionResponse;

      if (response.status === 202) {
        setMessage("Opnieuw gestart. Je factuur wordt nu veilig uitgelezen.");
        router.refresh();
        return;
      }

      if (result.code === "AI_NOT_CONFIGURED") {
        setMessage("Automatisch uitlezen is nu niet beschikbaar. Je originele factuur blijft veilig bewaard.");
        return;
      }

      if (response.status === 429 || result.code === "RATE_LIMITED") {
        const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "60", 10);
        const safeRetryAfter = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
        setRetryAfterSeconds(safeRetryAfter);
        setMessage(`Je hebt in korte tijd veel facturen laten uitlezen. Wacht ${retryWaitLabel(safeRetryAfter)}; daarna kun je hier opnieuw proberen.`);
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
      <button className="button button-secondary" type="button" disabled={busy || retryAfterSeconds > 0} onClick={() => void retry()}>
        {busy ? "Opnieuw proberen..." : retryAfterSeconds > 0 ? `Opnieuw over ${retryWaitLabel(retryAfterSeconds)}` : "Opnieuw uitlezen"}
      </button>
      {message ? <span role="status" aria-live="polite">{message}</span> : null}
    </div>
  );
}