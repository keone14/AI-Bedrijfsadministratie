import "server-only";
import { invoiceExtractionJsonSchema, validateInvoiceExtraction } from "./extraction-schema";

const OPENAI_API = "https://api.openai.com/v1";

type ExtractArgs = {
  apiKey: string;
  model: string;
  buffer: Buffer;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  filename: string;
  companyName: string;
};

type OpenAIResponse = {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function outputText(response: OpenAIResponse) {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function uploadPdf(apiKey: string, buffer: Buffer, filename: string) {
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), filename);

  const response = await fetch(`${OPENAI_API}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const json = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !json.id) throw new Error(json.error?.message ?? "OpenAI file upload failed");
  return json.id;
}

async function deleteFile(apiKey: string, fileId: string) {
  try {
    await fetch(`${OPENAI_API}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    // Best-effort cleanup of the provider-side temporary file.
  }
}

export async function extractInvoiceWithOpenAI(args: ExtractArgs) {
  let temporaryFileId: string | null = null;

  try {
    let inputDocument: Record<string, unknown>;
    if (args.mimeType === "application/pdf") {
      temporaryFileId = await uploadPdf(args.apiKey, args.buffer, args.filename);
      inputDocument = { type: "input_file", file_id: temporaryFileId };
    } else {
      inputDocument = {
        type: "input_image",
        image_url: `data:${args.mimeType};base64,${args.buffer.toString("base64")}`,
        detail: "high",
      };
    }

    const prompt = [
      "Lees alleen wat betrouwbaar uit deze factuur of creditnota blijkt.",
      `Het bedrijf van de gebruiker heet: ${args.companyName}. Gebruik die naam alleen om aankoop/verkoop te helpen bepalen; als dat niet duidelijk is, kies unknown.`,
      "Vul voor elk veld value en confidence tussen 0 en 1 in.",
      "Gebruik null wanneer een tekst, datum, bedrag of valuta niet betrouwbaar zichtbaar is.",
      "Datums moeten YYYY-MM-DD zijn. Geldbedragen zijn decimale getallen zonder valutasymbool.",
      "Valuta is alleen een ISO-4217 code als die betrouwbaar blijkt; anders null.",
      "Bereken geen ontbrekende bedragen en verzin niets. Neem geen fiscale of juridische conclusie.",
      "description is een korte feitelijke omschrijving van wat gefactureerd wordt, alleen als dit uit het document blijkt.",
    ].join("\n");

    const response = await fetch(`${OPENAI_API}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        store: false,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            inputDocument,
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "invoice_extraction",
            strict: true,
            schema: invoiceExtractionJsonSchema,
          },
        },
      }),
    });

    const json = await response.json() as OpenAIResponse;
    if (!response.ok) throw new Error(json.error?.message ?? "OpenAI extraction failed");

    const text = outputText(json);
    if (!text) throw new Error("OpenAI returned no structured extraction text");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("OpenAI returned invalid JSON");
    }

    const validated = validateInvoiceExtraction(parsed);
    if (!validated.success) throw new Error("OpenAI output did not pass the invoice schema");
    return validated.data;
  } finally {
    if (temporaryFileId) await deleteFile(args.apiKey, temporaryFileId);
  }
}
