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

test("verbindingsverlies liegt niet over een mogelijk opgeslagen duplicaatkeuze", async ({ page }) => {
  await page.route("**/api/invoices/invoice-duplicate-resolution-test/duplicate-resolution", async (route) => {
    await route.abort("connectionfailed");
  });

  await page.goto("/e2e-duplicate-resolution-fixture");
  await page.getByRole("button", { name: "Dit is echt een aparte factuur" }).click();

  await expect(page.getByRole("alert")).toContainText("Je keuze is mogelijk wel opgeslagen");
  await expect(page.getByRole("alert")).toContainText("actuele status");
  await expect(page.getByText(/er is niets aan je factuurstatus veranderd/i)).toHaveCount(0);
});
