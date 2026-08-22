import { test, expect, expectNoDocumentOverflow, expectNoRawKeys, expectSameOrigin } from "../fixtures/qaTest";
import { publicRoutes } from "../helpers/routes";

for (const locale of ["en", "fr"] as const) {
  test.describe(`public ${locale}`, () => {
    for (const route of [...publicRoutes, "/tutors/taylor-tutor"] as const) {
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
  });
}
