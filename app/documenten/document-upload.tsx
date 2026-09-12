"use client";

import { DragEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);

type UploadResult = {
  name: string;
  status: "pending" | "success" | "error";
  message: string;
};

type InitResponse = {
  documentId: string;
  storagePath: string;
  bucket: string;
  error?: string;
};

type FinalizeResponse = {
  documentId?: string;
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

export default function DocumentUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  async function uploadOne(file: File): Promise<UploadResult> {
    const localError = validateFile(file);
    if (localError) return { name: file.name, status: "error", message: localError };

    try {
      const initResponse = await fetch("/api/documents/upload/init", {
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
          cacheControl: "0",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (storageError) {
        return { name: file.name, status: "error", message: "Het bestand kon niet privé worden opgeslagen." };
      }

      const finalizeResponse = await fetch("/api/documents/upload/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: init.documentId,
          storagePath: init.storagePath,
          originalFilename: file.name,
        }),
      });
      const finalized = await finalizeResponse.json() as FinalizeResponse;

      if (!finalizeResponse.ok || !finalized.documentId) {
        return { name: file.name, status: "error", message: finalized.error ?? "Het document kon niet veilig worden geregistreerd." };
      }

      return {
        name: file.name,
        status: "success",
        message: "Veilig opgeslagen. Het type blijft bewust onbevestigd tot het betrouwbaar herkend of door jou gecontroleerd is.",
      };
    } catch {
      return {
        name: file.name,
        status: "error",
        message: "De verbinding werd onderbroken. Probeer dit bestand opnieuw te uploaden.",
      };
    }
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length || busy) return;

    if (files.length > MAX_FILES) {
      setResults([{ name: `${files.length} bestanden`, status: "error", message: "Upload maximaal 20 documenten tegelijk." }]);
      return;
    }

    setBusy(true);
    setResults(files.map((file) => ({ name: file.name, status: "pending", message: "Wacht op upload..." })));

    const finished: UploadResult[] = [];
    try {
      for (let i = 0; i < files.length; i += 3) {
        const batch = files.slice(i, i + 3);
        const batchResults = await Promise.all(batch.map(uploadOne));
        finished.push(...batchResults);
        setResults([
          ...finished,
          ...files.slice(i + 3).map((file) => ({ name: file.name, status: "pending" as const, message: "Wacht op upload..." })),
        ]);
      }
      setResults(finished);
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  const completedCount = results.filter((result) => result.status !== "pending").length;

  return (
    <section className="card document-upload-card" aria-labelledby="document-upload-title" aria-busy={busy}>
      <div className="document-upload-heading">
        <div>
          <div className="eyebrow">Veilige upload</div>
          <h2 id="document-upload-title">Voeg een bedrijfsdocument toe</h2>
          <p className="muted">Voor contracten, attesten, overheidsbrieven en andere bedrijfsdocumenten. PDF, JPG of PNG. Maximaal 20 tegelijk en 10 MB per bestand.</p>
        </div>
        <div className="document-actions">
          <a className="button secondary" href="/api/exports/documents">Download originelen</a>
          <button
            className="button secondary mobile-document-camera"
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
          >
            Foto maken
          </button>
          <button className="button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Bezig met uploaden..." : "+ Document toevoegen"}
          </button>
        </div>
      </div>

      <div className="document-route-note" role="note" aria-label="Facturen horen bij de facturenflow">
        <div>
          <strong>Wil je een factuur toevoegen?</strong>
          <span>Gebruik dan Facturen. Daar wordt het document niet alleen bewaard, maar ook uitgelezen, gecontroleerd en meegenomen in je financieel overzicht. Zo voorkom je dat een factuur als gewoon document blijft staan.</span>
        </div>
        <Link className="button secondary" href="/facturen">Naar Facturen</Link>
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        data-upload-source="files"
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={(event) => event.target.files && void handleFiles(event.target.files)}
      />

      <input
        ref={cameraInputRef}
        className="visually-hidden"
        data-upload-source="camera"
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={(event) => event.target.files && void handleFiles(event.target.files)}
      />

      <div
        className={`document-upload-dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <strong>Sleep andere bedrijfsdocumenten hierheen</strong>
        <span>Geen facturen. Op gsm kun je ook meteen een foto maken.</span>
      </div>

      <div className="document-upload-note">
        <strong>Geen gokwerk</strong>
        <span>Het originele bestand wordt privé bewaard. We zetten het documenttype niet automatisch vast zolang we het niet betrouwbaar kunnen bepalen.</span>
      </div>

      {results.length ? (
        <div className="document-upload-results" aria-live="polite">
          {busy ? <div className="document-upload-progress">{completedCount} van {results.length} verwerkt</div> : null}
          {results.map((result, index) => (
            <div className={`document-upload-result ${result.status}`} key={`${result.name}-${index}`}>
              <div>
                <strong>{result.name}</strong>
                <span>{result.message}</span>
              </div>
              <span aria-hidden="true">{result.status === "error" ? "!" : result.status === "pending" ? "…" : "✓"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
