import { notFound } from "next/navigation";
import InvoiceUpload from "../facturen/invoice-upload";
import "../facturen/facturen.css";

export const dynamic = "force-dynamic";

export default function BulkUploadE2EFixturePage() {
  if (process.env.E2E_TEST_MODE !== "1") notFound();

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
      <h1>Bulk upload test</h1>
      <InvoiceUpload />
    </main>
  );
}
