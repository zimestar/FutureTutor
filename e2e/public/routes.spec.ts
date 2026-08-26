import { test, expect, expectNoDocumentOverflow, expectNoRawKeys, expectSameOrigin } from "../fixtures/qaTest";
import { publicRoutes } from "../helpers/routes";

for (const locale of ["en", "fr"] as const) {
  test.describe(`public ${locale}`, () => {
    for (const route of publicRoutes) {
      test(`${route || "/"} renders safely`, async ({ page, baseURL }) => {
        const response = await page.goto(`/${locale}${route}`);
        expect(response?.status()).toBeLessThan(500);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible();
        await expectSameOrigin(page, baseURL!);
        await expectNoRawKeys(page);
        await expectNoDocumentOverflow(page);
      });
    }

    test("an available approved tutor profile renders safely", async ({ page, baseURL }) => {
      await page.goto(`/${locale}/find-tutors`);
      const profileLink = page.locator(`a[href^="/${locale}/tutors/"]`).first();

      if ((await profileLink.count()) === 0) {
        test.skip(true, "No approved public tutor exists in this environment.");
      }

      await profileLink.click();
      await expect(page.locator("h1").first()).toBeVisible();
      await expectSameOrigin(page, baseURL!);
      await expectNoRawKeys(page);
      await expectNoDocumentOverflow(page);
    });
  });
}
