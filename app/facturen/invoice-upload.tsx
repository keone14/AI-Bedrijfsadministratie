"use client";

import { DragEvent, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);

type UploadResult = {
  name: string;
  status: "success" | "error";
  message: string;
};

type InitResponse = {
  documentId: string;
  storagePath: string;
  bucket: string;
  error?: string;
};

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function validateFile(file: File) {
  if (!allowedExtensions.has(extension(file.name))) return "Gebruik een PDF-, JPG- of PNG-bestand.";
  if (file.size < 1) return "Dit bestand is leeg.";
  if (file.size > MAX_FILE_SIZE) return "Dit bestand is groter dan 10 MB.";
  return null;
}

export default function InvoiceUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  async function uploadOne(file: File): Promise<UploadResult> {
    const localError = validateFile(file);
    if (localError) return { name: file.name, status: "error", message: localError };

    const initResponse = await fetch("/api/invoices/upload/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, size: file.size, mimeType: file.type }),
    });
    const init = (await initResponse.json()) as InitResponse;
    if (!initResponse.ok) {
      return { name: file.name, status: "error", message: init.error ?? "Upload kon niet gestart worden." };
    }

    const supabase = createSupabaseBrowserClient();
    const { error: storageError } = await supabase.storage
      .from(init.bucket)
      .upload(init.storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

    if (storageError) {
      return { name: file.name, status: "error", message: "Het bestand kon niet privé worden opgeslagen." };
    }

    const finalizeResponse = await fetch("/api/invoices/upload/finalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        documentId: init.documentId,
        storagePath: init.storagePath,
        originalFilename: file.name,
      }),
    });
    const finalized = await finalizeResponse.json() as { error?: string };

    if (!finalizeResponse.ok) {
      return { name: file.name, status: "error", message: finalized.error ?? "De factuur kon niet veilig worden geregistreerd." };
    }

    return {
      name: file.name,
      status: "success",
      message: "Veilig opgeslagen. Klaar voor uitlezen.",
    };
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length || busy) return;

    if (files.length > MAX_FILES) {
      setResults([{ name: `${files.length} bestanden`, status: "error", message: "Upload maximaal 20 facturen tegelijk." }]);
      return;
    }

    setBusy(true);
    setResults(files.map((file) => ({ name: file.name, status: "success", message: "Wacht op upload..." })));

    const finished: UploadResult[] = [];
    for (let i = 0; i < files.length; i += 3) {
      const batch = files.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(uploadOne));
      finished.push(...batchResults);
      setResults([...finished, ...files.slice(i + 3).map((file) => ({ name: file.name, status: "success" as const, message: "Wacht op upload..." }))]);
    }

    setResults(finished);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <section className="card upload-card" aria-labelledby="invoice-upload-title">
      <div className="upload-card-heading">
        <div>
          <div className="eyebrow">Veilige upload</div>
          <h2 id="invoice-upload-title">Voeg je facturen toe</h2>
          <p className="muted">PDF, JPG of PNG. Maximaal 20 bestanden tegelijk en 10 MB per bestand.</p>
        </div>
        <button className="button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Bezig met uploaden..." : "+ Factuur uploaden"}
        </button>
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={(event) => event.target.files && void handleFiles(event.target.files)}
      />

      <div
        className={`upload-dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <strong>Sleep facturen hierheen</strong>
        <span>of gebruik de knop hierboven op gsm of pc.</span>
      </div>

      <div className="upload-trust-note">
        <strong>Wat gebeurt er veilig?</strong>
        <span>Het originele bestand blijft privé. Na upload controleren we op de server het echte bestandstype, de grootte en een SHA-256 vingerafdruk voordat het als factuur wordt geregistreerd.</span>
      </div>

      {results.length ? (
        <div className="upload-results" aria-live="polite">
          {results.map((result, index) => (
            <div className={`upload-result ${result.status}`} key={`${result.name}-${index}`}>
              <div>
                <strong>{result.name}</strong>
                <span>{result.message}</span>
              </div>
              <span aria-hidden="true">{result.status === "error" ? "!" : busy && result.message === "Wacht op upload..." ? "…" : "✓"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
