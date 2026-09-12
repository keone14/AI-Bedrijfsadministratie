import { notFound } from "next/navigation";
import DocumentUpload from "../documenten/document-upload";
import "../documenten/documenten.css";

export const dynamic = "force-dynamic";

export default function DocumentUploadE2EFixturePage() {
  if (process.env.E2E_TEST_MODE !== "1") notFound();

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Document upload test</h1>
      <DocumentUpload />
    </main>
  );
}
