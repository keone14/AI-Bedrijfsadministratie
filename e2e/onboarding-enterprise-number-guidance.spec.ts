import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function onboardingSource() {
  return readFile(join(process.cwd(), "app/onboarding/page.tsx"), "utf8");
}

test("onboarding explains likely establishment unit numbers before saving", async () => {
  const source = await onboardingSource();

  expect(source).toContain("Dit lijkt een vestigingseenheidsnummer, niet je ondernemingsnummer");
  expect(source).toContain("begint een ondernemingsnummer met 0 of 1");
  expect(source).toContain("Een vestigingseenheidsnummer heeft ook 10 cijfers, maar begint met 2 tot 8");
  expect(source).toContain('if (/^[2-8]/.test(digits))');
});

test("invalid enterprise number guidance is accessible and blocks progression", async () => {
  const source = await onboardingSource();

  expect(source).toContain('aria-describedby={enterpriseWarning ? "enterpriseNumberWarning" : undefined}');
  expect(source).toContain('aria-invalid={enterpriseWarning ? true : undefined}');
  expect(source).toContain('id="enterpriseNumberWarning" role="alert"');
  expect(source).toContain("Controleer het in KBO Public Search of kies ‘Ik weet dit niet’.");
});

test("enterprise number guidance links to official KBO Public Search", async () => {
  const source = await onboardingSource();
  expect(source).toContain("https://kbopub.economie.fgov.be/kbopub-m/home?lang=nl");
});
