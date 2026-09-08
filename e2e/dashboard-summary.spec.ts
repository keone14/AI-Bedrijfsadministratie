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
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Nog te controleren");

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test("confirmed invoice that is still unreliable remains a visible review item", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&unreliable=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("1");
  await expect(page.getByTestId("review-count")).toHaveText("1");
  await expect(page.getByTestId("summary-status")).toHaveText("incomplete");
  await expect(page.getByTestId("dashboard-revenue")).toContainText("1.000,00");
  await expect(page.getByTestId("dashboard-costs")).toContainText("0,00");
});

test("possible duplicate stays excluded until user confirms it is a distinct invoice", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&duplicate=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("2");
  await expect(page.getByTestId("review-count")).toHaveText("1");
  await expect(page.getByTestId("dashboard-costs")).toContainText("200,00");

  await page.goto("/e2e-dashboard-fixture?confirmed=1&duplicate=1&distinct=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("3");
  await expect(page.getByTestId("review-count")).toHaveText("0");
  await expect(page.getByTestId("dashboard-costs")).toContainText("400,00");

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test("every reliable non-VAT dashboard amount shows exact source invoices and contributions", async ({ page }) => {
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
  await expect(vatTrace).toContainText("aftrekbaarheid van aankoop-btw niet betrouwbaar vaststaat");
  await expect(vatTrace.getByTestId("dashboard-trace-row")).toHaveCount(0);
});

test("dashboard refuses to combine different currencies", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&mixed=1");
  await expect(page.getByTestId("summary-status")).toHaveText("mixed_currency");
  await expect(page.getByTestId("dashboard-revenue")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-costs")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-difference")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Meerdere valuta");
});

test("confirmed credit note reduces reliable non-VAT totals", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&credit=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("3");
  await expect(page.getByTestId("dashboard-revenue")).toContainText("900,00");
  await expect(page.getByTestId("dashboard-costs")).toContainText("200,00");
  await expect(page.getByTestId("dashboard-difference")).toContainText("700,00");
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Nog te controleren");
});

test("dashboard does not show a VAT estimate before VAT status is confirmed", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&vat=unknown");
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Btw-status niet bevestigd");
  const vatTrace = page.getByTestId("dashboard-vat-trace");
  await vatTrace.locator("summary").click();
  await expect(vatTrace.getByTestId("dashboard-trace-row")).toHaveCount(0);
});

test("confirmed VAT status still never assumes purchase VAT is fully deductible", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&vat=yes");
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Nog te controleren");
  const help = page.getByTestId("dashboard-vat").locator("xpath=ancestor::article").getByText("Leg dit simpel uit");
  await help.click();
  await expect(page.getByTestId("dashboard-vat").locator("xpath=ancestor::article")).toContainText("niet automatisch als volledig aftrekbaar behandeld");
});
