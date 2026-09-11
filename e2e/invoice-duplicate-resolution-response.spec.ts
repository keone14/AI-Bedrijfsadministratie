import { expect, test } from "@playwright/test";

test("geslaagde duplicaatkeuze blijft succesvol zonder JSON-response", async ({ page }) => {
  await page.route("**/api/invoices/invoice-duplicate-resolution-test/duplicate-resolution", async (route) => {
    await route.fulfill({
      status: 204,
      contentType: "text/plain",
      body: "",
    });
  });

  await page.goto("/e2e-duplicate-resolution-fixture");
  await page.getByRole("button", { name: "Dit is echt een aparte factuur" }).click();

  await expect(page.getByText(/verbinding werd onderbroken/i)).toHaveCount(0);
  await expect(page.getByText(/niet betrouwbaar bewaren/i)).toHaveCount(0);
});
