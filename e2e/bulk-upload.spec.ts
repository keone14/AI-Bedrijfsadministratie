import { expect, test } from "@playwright/test";

function pdfFile(index: number) {
  return {
    name: `factuur-${String(index).padStart(2, "0")}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\nsynthetic invoice ${index}\n%%EOF`),
  };
}

test("20 facturen worden in begrensde batches verwerkt zonder verlies", async ({ page }) => {
  let initCalls = 0;
  let finalizeCalls = 0;
  let extractCalls = 0;
  let storageCalls = 0;

  await page.route("**/api/invoices/upload/init", async (route) => {
    initCalls += 1;
    const payload = route.request().postDataJSON() as { filename: string };
    const index = Number(payload.filename.match(/(\d+)/)?.[1] ?? initCalls);
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        documentId: id,
        companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        storagePath: `company/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/documents/${id}/original.pdf`,
        bucket: "company-documents",
        maxFileSize: 10 * 1024 * 1024,
      }),
    });
  });

  await page.route("https://example.supabase.co/storage/v1/object/**", async (route) => {
    storageCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "ok" }) });
  });

  await page.route("**/api/invoices/upload/finalize", async (route) => {
    finalizeCalls += 1;
    const payload = route.request().postDataJSON() as { documentId: string };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ invoiceId: `invoice-${payload.documentId}`, documentId: payload.documentId, status: "uploaded" }) });
  });

  await page.route("**/api/invoices/*/extract", async (route) => {
    extractCalls += 1;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "processing" }) });
  });

  await page.goto("/e2e-bulk-upload-fixture");
  const files = Array.from({ length: 20 }, (_, index) => pdfFile(index + 1));
  await page.locator('input[type="file"]').setInputFiles(files);

  await expect(page.getByText("20 facturen zijn veilig toegevoegd.")).toBeVisible();
  await expect(page.getByText("Je bent klaar met uploaden. Controleer hieronder alleen facturen die om nakijken vragen.")).toBeVisible();
  await expect(page.locator(".upload-result.success")).toHaveCount(20);
  await expect(page.locator(".upload-result.error")).toHaveCount(0);
  await expect(page.getByText("factuur-01.pdf")).toBeVisible();
  await expect(page.getByText("factuur-20.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Factuur uploaden" })).toBeEnabled();

  expect(initCalls).toBe(20);
  expect(storageCalls).toBe(20);
  expect(finalizeCalls).toBe(20);
  expect(extractCalls).toBe(20);
});

test("bij één mislukking worden alleen mislukte facturen opnieuw verstuurd", async ({ page }) => {
  let initCalls = 0;
  const initByName = new Map<string, number>();

  await page.route("**/api/invoices/upload/init", async (route) => {
    initCalls += 1;
    const payload = route.request().postDataJSON() as { filename: string };
    const count = (initByName.get(payload.filename) ?? 0) + 1;
    initByName.set(payload.filename, count);
    if (payload.filename === "factuur-07.pdf" && count === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Tijdelijke storing" }) });
      return;
    }
    const id = `00000000-0000-4000-8000-${String(initCalls).padStart(12, "0")}`;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ documentId: id, storagePath: `company/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/documents/${id}/original.pdf`, bucket: "company-documents" }) });
  });
  await page.route("https://example.supabase.co/storage/v1/object/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/invoices/upload/finalize", async (route) => {
    const payload = route.request().postDataJSON() as { documentId: string };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ invoiceId: `invoice-${payload.documentId}` }) });
  });
  await page.route("**/api/invoices/*/extract", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "processing" }) }));

  await page.goto("/e2e-bulk-upload-fixture");
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 20 }, (_, index) => pdfFile(index + 1)));
  await expect(page.getByText("1 factuur is niet gelukt. Succesvolle uploads blijven behouden.")).toBeVisible();
  await expect(page.locator(".upload-result.success")).toHaveCount(19);
  await page.getByRole("button", { name: "Probeer alleen mislukte opnieuw" }).click();
  await expect(page.getByText("1 factuur is veilig toegevoegd.")).toBeVisible();
  await expect(page.locator(".upload-result.success")).toHaveCount(1);
  expect(initByName.get("factuur-07.pdf")).toBe(2);
  for (let index = 1; index <= 20; index += 1) {
    if (index === 7) continue;
    expect(initByName.get(`factuur-${String(index).padStart(2, "0")}.pdf`)).toBe(1);
  }
});
