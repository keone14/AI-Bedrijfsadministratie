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

test("dashboard refuses to combine different currencies", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&mixed=1");
  await expect(page.getByTestId("summary-status")).toHaveText("mixed_currency");
  await expect(page.getByTestId("reliable-count")).toHaveText("2");
  await expect(page.getByTestId("dashboard-revenue")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-costs")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-difference")).toHaveText("Meerdere valuta");
  await expect(page.getByTestId("dashboard-vat")).toHaveText("Meerdere valuta");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("confirmed credit note reduces revenue and VAT instead of increasing them", async ({ page }) => {
  await page.goto("/e2e-dashboard-fixture?confirmed=1&credit=1");
  await expect(page.getByTestId("reliable-count")).toHaveText("3");
  await expect(page.getByTestId("dashboard-revenue")).toContainText("900,00");
  await expect(page.getByTestId("dashboard-costs")).toContainText("200,00");
  await expect(page.getByTestId("dashboard-difference")).toContainText("700,00");
  await expect(page.getByTestId("dashboard-vat")).toContainText("147,00");
});
