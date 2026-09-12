import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function onboardingSource() {
  return readFile(join(process.cwd(), "app/onboarding/page.tsx"), "utf8");
}

test("onboarding cannot keep a periodic VAT frequency after confirmed non-VAT status", async () => {
  const source = await onboardingSource();

  expect(source).toContain('vatFrequency: value === "no" ? "not_applicable"');
  expect(source).toContain('form.vatStatus === "no" && form.vatFrequency !== "not_applicable"');
  expect(source).toContain('form.vatStatus === "no" ? (');
  expect(source).toContain("we slaan geen tegenstrijdige btw-gegevens op");
});

test("unknown VAT status resets the periodic filing rhythm to unknown", async () => {
  const source = await onboardingSource();

  expect(source).toContain('value === "unknown" ? "unknown" : current.vatFrequency');
  expect(source).toContain("We tonen voorlopig geen definitieve btw-deadlines.");
});

test("VAT exemption explanation points users to the competent Belgian authority", async () => {
  const source = await onboardingSource();

  expect(source).toContain("https://financien.belgium.be/nl/ondernemingen/btw/btw-plicht/vrijstellingsregeling");
  expect(source).toContain("vrijstellingsregeling voor kleine ondernemingen");
  expect(source).toContain("nog btw-belastingplichtige, maar dien je geen periodieke aangiften in");
});
