import { expect, test } from "@playwright/test";

const requiredWidths = [360, 390, 430, 768, 900, 1024, 1440] as const;
const coreFixtures = [
  { path: "/e2e-dashboard-fixture?confirmed=1", heading: "Dashboard test" },
  { path: "/e2e-review-fixture", heading: "Factuur nakijken" },
  { path: "/e2e-bulk-upload-fixture", heading: "Facturen upload test" },
] as const;

test.describe("kernflows blijven bruikbaar op alle afgesproken schermbreedtes", () => {
  test.skip(({ }, testInfo) => testInfo.project.name !== "desktop", "Breedtematrix draait één keer; de gewone mobile-projecttests blijven daarnaast bestaan.");

  for (const width of requiredWidths) {
    for (const fixture of coreFixtures) {
      test(`${fixture.heading} heeft geen horizontale overflow op ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
        await page.goto(fixture.path);

        await expect(page.getByRole("heading", { name: fixture.heading })).toBeVisible();

        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          return {
            rootScrollWidth: root.scrollWidth,
            rootClientWidth: root.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            bodyClientWidth: body.clientWidth,
          };
        });

        expect(overflow.rootScrollWidth).toBeLessThanOrEqual(overflow.rootClientWidth + 1);
        expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth + 1);

        if (width <= 430) {
          const primaryControls = page.locator(".button:visible");
          const count = await primaryControls.count();
          for (let index = 0; index < count; index += 1) {
            const box = await primaryControls.nth(index).boundingBox();
            if (box) expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      });
    }
  }
});
