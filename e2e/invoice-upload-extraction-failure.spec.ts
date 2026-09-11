import { expect, test } from "@playwright/test";

test("een uitleesfout na veilige registratie markeert de upload niet als mislukt", async ({ page }) => {
  let initCalls = 0;
  let finalizeCalls = 0;
  let extractCalls = 0;

  await page.route("**/api/invoices/upload/init", async (route) => {
    initCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        documentId: "00000000-0000-4000-8000-000000000001",
        storagePath: "company/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/documents/00000000-0000-4000-8000-000000000001/original.pdf",
        bucket: "company-documents",
      }),
    });
  });

  await page.route("https://example.supabase.co/storage/v1/object/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/invoices/upload/finalize", async (route) => {
    finalizeCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ invoiceId: "invoice-1" }),
    });
  });

  await page.route("**/api/invoices/*/extract", async (route) => {
    extractCalls += 1;
    await route.fulfill({ status: 502, contentType: "text/html", body: "<html>tijdelijke storing</html>" });
  });

  await page.goto("/e2e-bulk-upload-fixture");
  await page.locator('input[data-upload-source="files"]').setInputFiles({
    name: "factuur.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsynthetic invoice\n%%EOF"),
  });

  await expect(page.getByText("1 factuur is veilig toegevoegd.")).toBeVisible();
  await expect(page.getByText("Veilig opgeslagen. Uitlezing kon nu niet worden gestart; je document blijft behouden.")).toBeVisible();
  await expect(page.locator(".upload-result.success")).toHaveCount(1);
  await expect(page.locator(".upload-result.error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Probeer alleen mislukte opnieuw" })).toHaveCount(0);

  expect(initCalls).toBe(1);
  expect(finalizeCalls).toBe(1);
  expect(extractCalls).toBe(1);
});
