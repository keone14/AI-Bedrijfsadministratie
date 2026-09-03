import { expect, test } from "@playwright/test";

test("dashboard excludes uncertain invoice and updates after confirmation", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=0");
  await expect(page.getByTestId("reliable-count")).toHaveText("1");
  await expect(page.getByTestId("dashboard-revenue")).toContainText("0,00");
  await expect(page.getByTestId("dashboard-costs")).toContainText("200,00");
  await expect(page.getByTestId("dashboard-difference")).toContainText("-200,00");

  await page.goto("/e2e-dashboard-fixture?confirmed=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("2");
  await expect(page.getByTestId("dashboard-revenue")).toContainText("1.000,00");
  await expect(page.getByTestId("dashboard-costs")).toContainText("200,00");
  await expect(page.getByTestId("dashboard-difference")).toContainText("800,00");
  await expect(page.getByTestId("dashboard-vat")).toContainText("168,00");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("every dashboard amount shows the exact source invoices and contributions", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1");

  const revenueTrace = page.getByTestId("dashboard-revenue-trace");
  await revenueTrace.locator("summary").click();
  await expect(revenueTrace.getByTestId("dashboard-trace-row")).toHaveCount(1);
  await expect(revenueTrace).toContainText("Klant Alpha");
  await expect(revenueTrace).toContainText("V-2026-001");
  await expect(revenueTrace).toContainText("1.000,00");

  const costsTrace = page.getByTestId("dashboard-costs-trace");
  await costsTrace.locator("summary").click();
  await expect(costsTrace.getByTestId("dashboard-trace-row")).toHaveCount(1);
  await expect(costsTrace).toContainText("Leverancier Beta");
  await expect(costsTrace).toContainText("200,00");

  const differenceTrace = page.getByTestId("dashboard-difference-trace");
  await differenceTrace.locator("summary").click();
  await expect(differenceTrace.getByTestId("dashboard-trace-row")).toHaveCount(2);
  await expect(differenceTrace).toContainText("1.000,00");
  await expect(differenceTrace).toContainText("€ -200,00");

  const vatTrace = page.getByTestId("dashboard-vat-trace");
  await vatTrace.locator("summary").click();
  await expect(vatTrace.getByTestId("dashboard-trace-row")).toHaveCount(2);
  await expect(vatTrace).toContainText("210,00");
  await expect(vatTrace).toContainText("€ -42,00");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("dashboard refuses to combine different currencies", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&mixed=1");
  await expect(page.getByTestId("summary-status")).toHaveText("mixed_currency");
  await expect(page.getByTestId("reliable-count")).toHaveText("2");
  await expect(page.getByTestId("dashboard-revenue")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-costs")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-difference")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Meerdere valuta");

  const revenueTrace = page.getByTestId("dashboard-revenue-trace");
  await revenueTrace.locator("summary").click();
  await expect(revenueTrace).toContainText("geen betrouwbaar gecombineerd bedrag");
  await expect(revenueTrace.getByTestId("dashboard-trace-row")).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("confirmed credit note reduces totals and appears as a negative source contribution", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&credit=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("3");
  await expect(page.getByTestId("dashboard-revenue")).toContainText("900,00");
  await expect(page.getByTestId("dashboard-costs")).toContainText("200,00");
  await expect(page.getByTestId("dashboard-difference")).toContainText("700,00");
  await expect(page.getByTestId("dashboard-vat")).toContainText("147,00");

  const revenueTrace = page.getByTestId("dashboard-revenue-trace");
  await revenueTrace.locator("summary").click();
  await expect(revenueTrace.getByTestId("dashboard-trace-row")).toHaveCount(2);
  await expect(revenueTrace).toContainText("Creditnota");
  await expect(revenueTrace).toContainText("CN-2026-001");
  await expect(revenueTrace).toContainText("€ -100,00");
});
