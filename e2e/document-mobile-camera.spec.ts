import { expect, test } from "@playwright/test";

function imageFile() {
  return {
    name: "overheidsbrief.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  };
}

test("documentenkluis toont de camera-actie alleen op mobiel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e-document-upload-fixture");

  const cameraButton = page.getByRole("button", { name: "Foto maken" });
  await expect(cameraButton).toBeVisible();
  const cameraButtonBox = await cameraButton.boundingBox();
  expect(cameraButtonBox, "De mobiele camera-actie moet een meetbare touch target hebben.").not.toBeNull();
  expect(cameraButtonBox!.height).toBeGreaterThanOrEqual(44);

  const cameraInput = page.locator('input[data-upload-source="camera"]');
  await expect(cameraInput).toHaveAttribute("accept", "image/jpeg,image/png");
  await expect(cameraInput).toHaveAttribute("capture", "environment");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(cameraButton).toBeHidden();
});

test("een foto uit de mobiele cameraflow wordt veilig via de bestaande documentflow verwerkt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route("**/api/documents/upload/init", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        documentId: "00000000-0000-4000-8000-000000000001",
        companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        storagePath: "company/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/documents/00000000-0000-4000-8000-000000000001/original.jpg",
        bucket: "company-documents",
      }),
    });
  });

  await page.route("https://example.supabase.co/storage/v1/object/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/documents/upload/finalize", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documentId: "00000000-0000-4000-8000-000000000001" }),
    });
  });

  await page.goto("/e2e-document-upload-fixture");
  await page.locator('input[data-upload-source="camera"]').setInputFiles(imageFile());

  await expect(page.getByText("overheidsbrief.jpg")).toBeVisible();
  await expect(page.locator(".document-upload-result.success")).toHaveCount(1);
  await expect(page.getByText(/Veilig opgeslagen/)).toBeVisible();
});
