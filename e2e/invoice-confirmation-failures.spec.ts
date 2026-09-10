import { expect, test } from "@playwright/test";

test("temporary server failure never falsely confirms an invoice and allows a safe retry", async ({ page }) => {
  let confirmAttempts = 0;

  await page.route("**/api/invoices/e2e-invoice/confirm", async (route) => {
    confirmAttempts += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "De factuur kon nu niet betrouwbaar worden bevestigd. Er is niets gewijzigd. Probeer opnieuw.",
      }),
    });
  });

  await page.goto("/e2e-review-fixture");
  await page.getByRole("button", { name: "Ja, dit klopt" }).click();

  await expect.poll(() => confirmAttempts).toBe(1);
  await expect(page.locator(".invoice-action-message.is-error")).toContainText(
    "De factuur kon nu niet betrouwbaar worden bevestigd. Er is niets gewijzigd. Probeer opnieuw.",
  );
  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Aanpassen" })).toBeEnabled();
});

test("broken confirmation response fails closed instead of showing success", async ({ page }) => {
  let confirmAttempts = 0;

  await page.route("**/api/invoices/e2e-invoice/confirm", async (route) => {
    confirmAttempts += 1;
    await route.fulfill({
      status: 502,
      contentType: "text/plain",
      body: "upstream unavailable",
    });
  });

  await page.goto("/e2e-review-fixture");
  await page.getByRole("button", { name: "Ja, dit klopt" }).click();

  await expect.poll(() => confirmAttempts).toBe(1);
  await expect(page.locator(".invoice-action-message.is-error")).toContainText("Bevestiging mislukt.");
  await expect(page.getByRole("button", { name: "Ja, dit klopt" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Aanpassen" })).toBeEnabled();
});
