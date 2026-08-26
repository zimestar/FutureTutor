import { test, expect, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";

test.setTimeout(120_000);

async function expectImageReady(page: import("@playwright/test").Page, pattern: string) {
  const image = page.locator(`img[src*="${pattern}"]`).first();
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((node) => (node as HTMLImageElement).decode());
  await expect(image).toBeVisible();
  expect(await image.evaluate((node) => ({ width: (node as HTMLImageElement).naturalWidth, height: (node as HTMLImageElement).naturalHeight }))).toEqual(
    expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
  );
  expect(await image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

for (const locale of ["en", "fr"] as const) {
  test(`${locale} approved editorial assets render without broken images`, async ({ page }) => {
    await page.goto(`/${locale}`);
    for (const asset of ["parents-students-hero", "learning-breakthrough", "online-tutoring"]) {
      await expectImageReady(page, asset);
    }

    await page.goto(`/${locale}/become-a-tutor`);
    await expectImageReady(page, "tutor-hero");

    await page.goto(`/${locale}/about`);
    await expectImageReady(page, "about-mission");

    await page.goto(`/${locale}/login`);
    const portrait = page.locator('img[src*="auth-editorial-"]');
    if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(portrait).toBeVisible();
    else await expect(portrait).toBeHidden();
    expect(await portrait.getAttribute("src")).toMatch(/auth-editorial-[1-5]\.png/);
    await expectNoRawKeys(page);
    await expectNoDocumentOverflow(page);
  });
}

test("all five auth portrait sources are reachable", async ({ request, baseURL }) => {
  for (let index = 1; index <= 5; index += 1) {
    const response = await request.get(`${baseURL}/images/auth-editorial-${index}.png`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
});
