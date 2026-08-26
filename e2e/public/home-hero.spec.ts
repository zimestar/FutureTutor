import { expect, test, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";

for (const locale of ["en", "fr"] as const) {
  test(`${locale} homepage hero keeps the approved editorial hierarchy`, async ({ page }) => {
    await page.goto(`/${locale}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      locale === "en" ? "Understand today" : "Comprendre aujourd’hui",
    );
    await expect(page.locator('img[src*="parents-students-hero"]')).toBeVisible();
    await expect(page.locator('label[for="search-subject"]')).toBeVisible();
    await expect(page.locator('label[for="search-level"]')).toBeVisible();
    await expect(page.locator('label[for="search-mode"]')).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toContainText(
      locale === "en" ? "Find my tutor" : "Trouver mon tuteur",
    );

    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth >= 1024) {
      const imageWidth = await page.locator('img[src*="parents-students-hero"]').evaluate((image) => image.getBoundingClientRect().width);
      expect(imageWidth).toBeGreaterThan(viewportWidth * 0.5);
    }

    await expectNoDocumentOverflow(page);
    await expectNoRawKeys(page);
  });
}
