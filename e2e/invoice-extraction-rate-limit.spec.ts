import { expect, test } from "@playwright/test";

test("rate limit toont duidelijke wachttijd en voorkomt herhaald klikken", async ({ page }) => {
  await page.route("**/api/invoices/invoice-rate-limit-test/extract", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "120" },
      body: JSON.stringify({
        error: "Je hebt in korte tijd veel facturen laten uitlezen. Probeer later opnieuw.",
        code: "RATE_LIMITED",
      }),
    });
  });

  await page.goto("/e2e-extraction-retry-fixture");
  const button = page.getByRole("button", { name: "Opnieuw uitlezen" });
  await button.click();

  await expect(page.getByRole("status")).toContainText("Wacht 2 min");
  await expect(page.getByRole("button", { name: /Opnieuw over/ })).toBeDisabled();
});
