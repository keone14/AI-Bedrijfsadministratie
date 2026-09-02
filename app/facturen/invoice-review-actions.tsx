"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InvoiceReviewActions({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/confirm`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Bevestiging mislukt.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bevestiging mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="invoice-review-actions">
      <button className="button" type="button" disabled={busy} onClick={confirm}>
        {busy ? "Bevestigen..." : "Ja, dit klopt"}
      </button>
      <span className="muted">Zie je iets fout? Laat het nog onbevestigd; aanpassen bouwen we als aparte, auditbare stap.</span>
      {error ? <span className="invoice-action-error" role="alert">{error}</span> : null}
    </div>
  );
}
