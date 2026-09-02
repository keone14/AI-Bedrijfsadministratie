import { after, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractInvoiceWithOpenAI } from "@/lib/invoices/openai-extractor";

const supportedMimes = new Set(["application/pdf", "image/jpeg", "image/png"]);

type RouteContext = { params: Promise<{ invoiceId: string }> };

function processingConfiguration() {
  const provider = process.env.AI_INVOICE_PROVIDER;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_INVOICE_MODEL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (provider !== "openai" || !apiKey || !model || !serviceRoleKey) return null;
  return { provider, apiKey, model };
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("schema") || message.includes("invalid json")) return "invalid_ai_output";
  if (message.includes("file upload")) return "provider_file_upload_failed";
  if (message.includes("no structured")) return "empty_ai_output";
  if (message.includes("download")) return "document_download_failed";
  return "ai_processing_failed";
}

export async function GET() {
  return NextResponse.json({ enabled: Boolean(processingConfiguration()) });
}

export async function POST(_request: Request, context: RouteContext) {
  const configuration = processingConfiguration();
  if (!configuration) {
    return NextResponse.json(
      {
        error: "AI-uitlezing is nog niet geactiveerd. Er wordt geen document naar een externe AI-dienst gestuurd zolang de serverconfiguratie niet expliciet is ingesteld.",
        code: "AI_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const { invoiceId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, company_id, document_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Deze factuur is niet beschikbaar voor jouw bedrijf." }, { status: 404 });
  }

  const [{ data: document }, { data: company }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, storage_path, mime_type, original_filename")
      .eq("id", invoice.document_id)
      .eq("company_id", invoice.company_id)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("id, name")
      .eq("id", invoice.company_id)
      .maybeSingle(),
  ]);

  if (!document || !company || !supportedMimes.has(document.mime_type)) {
    return NextResponse.json({ error: "Deze factuur kan niet betrouwbaar worden voorbereid voor uitlezing." }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  const { data: jobId, error: jobError } = await admin.rpc("mark_invoice_processing", {
    target_invoice_id: invoice.id,
    target_provider: configuration.provider,
    target_model_version: configuration.model,
  });

  if (jobError) {
    const alreadyStarted = jobError.message?.toLowerCase().includes("already started");
    return NextResponse.json(
      { error: alreadyStarted ? "Deze factuur wordt al verwerkt of wacht al op controle." : "De verwerking kon niet veilig worden gestart." },
      { status: alreadyStarted ? 409 : 500 },
    );
  }

  after(async () => {
    try {
      const { data: blob, error: downloadError } = await admin.storage
        .from("company-documents")
        .download(document.storage_path);
      if (downloadError || !blob) throw new Error("document download failed");

      const extraction = await extractInvoiceWithOpenAI({
        apiKey: configuration.apiKey,
        model: configuration.model,
        buffer: Buffer.from(await blob.arrayBuffer()),
        mimeType: document.mime_type as "application/pdf" | "image/jpeg" | "image/png",
        filename: document.original_filename,
        companyName: company.name,
      });

      const { error: applyError } = await admin.rpc("apply_validated_invoice_extraction", {
        target_invoice_id: invoice.id,
        extraction,
        extraction_model_version: configuration.model,
        extraction_method_name: "openai_responses_vision_structured_output",
      });
      if (applyError) throw new Error("validated extraction could not be committed");
    } catch (error) {
      await admin.rpc("mark_invoice_processing_failed", {
        target_invoice_id: invoice.id,
        target_error_code: errorCode(error),
      });
    }
  });

  return NextResponse.json({
    invoiceId: invoice.id,
    jobId,
    status: "processing",
    message: "De factuur wordt veilig uitgelezen. Het resultaat wordt altijd eerst als te controleren gegevens opgeslagen.",
  }, { status: 202 });
}
