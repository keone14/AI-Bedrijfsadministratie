import { expect, test } from "@playwright/test";

test("invoice review correction and confirmation works without horizontal overflow", async ({ page }) => {
  let correctionBody: Record<string, unknown> | null = null;
  let confirmCalled = false;

  await page.route("**/api/invoices/e2e-invoice/correct", async (route) => {
    correctionBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Je aanpassingen zijn veilig opgeslagen." }),
    });
  });

  await page.route("**/api/invoices/e2e-invoice/confirm", async (route) => {
    confirmCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/__e2e/review");
  await expect(page.getByRole("heading", { name: "Factuur nakijken" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Aanpassen" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.getByRole("button", { name: "Aanpassen" }).click();
  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeDisabled();
  await expect(page.getByText("Sla je wijzigingen eerst op. Pas daarna kun je de factuur bevestigen.")).toBeVisible();
  await expect(page.getByLabel("Uitleg over Factuurnummer")).toBeVisible();

  await page.locator("#correction-subtotal").fill("101");
  await expect(page.getByText("De bedragen tellen niet helemaal op.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aanpassingen opslaan" })).toBeDisabled();

  await page.locator("#correction-subtotal").fill("100");
  await page.locator("#correction-supplier").fill("Gecorrigeerde Leverancier BV");
  await page.locator("#correction-category").selectOption("marketing");
  await expect(page.getByRole("button", { name: "Aanpassingen opslaan" })).toBeEnabled();
  await page.getByRole("button", { name: "Aanpassingen opslaan" }).click();

  await expect.poll(() => correctionBody).not.toBeNull();
  expect(correctionBody).toMatchObject({
    supplierName: "Gecorrigeerde Leverancier BV",
    categoryId: "marketing",
  });
  await expect(page.getByText("Je aanpassingen zijn veilig opgeslagen.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeEnabled();

  await page.getByRole("button", { name: "Ja, dit klopt" }).click();
  await expect.poll(() => confirmCalled).toBe(true);
});

test("cancel discards unsaved invoice edits", async ({ page }) => {
  await page.goto("/__e2e/review");
  await page.getByRole("button", { name: "Aanpassen" }).click();
  await page.locator("#correction-supplier").fill("Niet opgeslagen leverancier");
  await page.getByRole("button", { name: "Annuleren" }).click();
  await page.getByRole("button", { name: "Aanpassen" }).click();
  await expect(page.locator("#correction-supplier")).toHaveValue("Voorbeeld Leverancier BV");
});
