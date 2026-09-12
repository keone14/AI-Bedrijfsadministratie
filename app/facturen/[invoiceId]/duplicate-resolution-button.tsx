"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  invoiceId: string;
  distinct: boolean;
};

export default function DuplicateResolutionButton({ invoiceId, distinct }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveResolution() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/duplicate-resolution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ distinct }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        setError(body?.error ?? "We konden je keuze niet betrouwbaar bewaren.");
        return;
      }

      router.refresh();
    } catch {
      setError("De verbinding werd onderbroken. Je keuze is mogelijk wel opgeslagen. We verversen de factuur zodat je de actuele status kunt controleren.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="button secondary" type="button" disabled={busy} onClick={saveResolution}>
        {busy
          ? "Keuze bewaren..."
          : distinct
            ? "Dit is echt een aparte factuur"
            : "Opnieuw als mogelijk dubbel controleren"}
      </button>
      {error ? <p className="invoice-source-action-error" role="alert" aria-live="polite">{error}</p> : null}
    </div>
  );
}
