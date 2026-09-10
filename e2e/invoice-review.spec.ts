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

  await page.goto("/e2e-review-fixture");
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

test("invoice with inconsistent stored totals cannot be confirmed", async ({ page }) => {
  let confirmCalled = false;

  await page.route("**/api/invoices/e2e-invoice/confirm", async (route) => {
    confirmCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/e2e-review-fixture?mismatch=1");

  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeDisabled();
  await expect(page.getByText("Deze factuur is nog niet klaar om te bevestigen.")).toBeVisible();
  await expect(page.getByText(/bedragen die niet optellen/i)).toBeVisible();
  expect(confirmCalled).toBe(false);
});

test("cancel discards unsaved invoice edits", async ({ page }) => {
  await page.goto("/e2e-review-fixture");
  await page.getByRole("button", { name: "Aanpassen" }).click();
  await page.locator("#correction-supplier").fill("Niet opgeslagen leverancier");
  await page.getByRole("button", { name: "Annuleren" }).click();
  await page.getByRole("button", { name: "Aanpassen" }).click();
  await expect(page.locator("#correction-supplier")).toHaveValue("Voorbeeld Leverancier BV");
});

test("expired session is explained without falsely confirming the invoice", async ({ page }) => {
  let confirmAttempts = 0;

  await page.route("**/api/invoices/e2e-invoice/confirm", async (route) => {
    confirmAttempts += 1;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Je sessie is verlopen. Log opnieuw in." }),
    });
  });

  await page.goto("/e2e-review-fixture");
  await page.getByRole("button", { name: "Ja, dit klopt" }).click();

  await expect.poll(() => confirmAttempts).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Je sessie is verlopen. Log opnieuw in.");
  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Aanpassen" })).toBeEnabled();
});

test("failed correction keeps the user's edits and gives a safe retry path", async ({ page }) => {
  let saveAttempts = 0;

  await page.route("**/api/invoices/e2e-invoice/correct", async (route) => {
    saveAttempts += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Je aanpassingen konden niet betrouwbaar worden opgeslagen. Probeer opnieuw." }),
    });
  });

  await page.goto("/e2e-review-fixture");
  await page.getByRole("button", { name: "Aanpassen" }).click();
  await page.locator("#correction-supplier").fill("Leverancier na serverfout");
  await page.getByRole("button", { name: "Aanpassingen opslaan" }).click();

  await expect.poll(() => saveAttempts).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Je aanpassingen konden niet betrouwbaar worden opgeslagen. Probeer opnieuw.");
  await expect(page.locator("#correction-supplier")).toHaveValue("Leverancier na serverfout");
  await expect(page.getByRole("button", { name: "Aanpassingen opslaan" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Annuleren" })).toBeEnabled();
});

for (const width of [360, 390, 430, 768, 900, 1024, 1440]) {
  test(`invoice review stays usable without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 430 ? 800 : 900 });
    await page.goto("/e2e-review-fixture");

    await expect(page.getByRole("heading", { name: "Factuur nakijken" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aanpassen" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "Aanpassen" }).click();
    await expect(page.locator("#correction-invoice-type")).toBeVisible();
    await expect(page.locator("#correction-total")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aanpassingen opslaan" })).toBeVisible();

    const editingHasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(editingHasHorizontalOverflow).toBe(false);
  });
}
