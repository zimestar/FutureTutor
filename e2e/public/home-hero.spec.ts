import { expect, test, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";

for (const locale of ["en", "fr"] as const) {
  test(`${locale} homepage hero keeps the approved editorial hierarchy`, async ({ page }) => {
    await page.goto(`/${locale}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "en"
        ? "The right person can change the way you learn."
        : "La bonne personne peut changer votre façon d’apprendre.",
    );
    const emphasis = page.getByRole("heading", { level: 1 }).locator("span").first();
    await expect(emphasis).toHaveText(locale === "en" ? "The right person" : "La bonne personne");
    await expect(emphasis).toHaveClass(/text-blue/);
    await expect(page.locator('img[src*="parents-students-hero"]')).toBeVisible();
    await expect(page.locator('label[for="search-subject"]')).toBeVisible();
    await expect(page.locator('label[for="search-level"]')).toBeVisible();
    await expect(page.locator('label[for="search-mode"]')).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toContainText(
      locale === "en" ? "Find my tutor" : "Trouver mon tuteur",
    );

    const viewportWidth = page.viewportSize()?.width ?? 0;
    const compactMenu = page.getByRole("button", {
      name: locale === "en" ? "Open menu" : "Ouvrir le menu",
    });
    const desktopNavigation = page.getByTestId("desktop-navigation");
    const expectsDesktopNavigation = locale === "fr" ? viewportWidth >= 1440 : viewportWidth >= 1280;
    if (expectsDesktopNavigation) {
      await expect(desktopNavigation).toBeVisible();
      await expect(compactMenu).toBeHidden();
    } else {
      await expect(desktopNavigation).toBeHidden();
      await expect(compactMenu).toBeVisible();
    }

    if (viewportWidth >= 1280) {
      const imageWidth = await page.locator('img[src*="parents-students-hero"]').evaluate((image) => image.getBoundingClientRect().width);
      expect(imageWidth).toBeGreaterThan(viewportWidth * 0.5);

      const safeZone = await page.evaluate(() => {
        const copy = document.querySelector('[data-testid="hero-copy"]')!.getBoundingClientRect();
        const visual = document.querySelector('[data-testid="hero-visual"]')!.getBoundingClientRect();
        return { copyRight: copy.right, imageSubjectSafeEdge: visual.left + visual.width * 0.35 };
      });
      expect(safeZone.copyRight).toBeLessThanOrEqual(safeZone.imageSubjectSafeEdge);
    }

    const headingLines = await page.getByTestId("hero-heading").evaluate((heading) => {
      const styles = getComputedStyle(heading);
      return Math.round(heading.getBoundingClientRect().height / Number.parseFloat(styles.lineHeight));
    });
    expect(headingLines).toBeLessThanOrEqual(locale === "fr" ? 5 : 4);

    for (const item of await page.getByTestId("hero-trust-row").locator("li").all()) {
      const dimensions = await item.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }

    await expectNoDocumentOverflow(page);
    await expectNoRawKeys(page);
  });

  test(`${locale} homepage subject combobox is visible, layered and keyboard usable`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const input = page.locator("#search-subject");
    await input.click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option")).toHaveCount(10);

    const boxes = await input.evaluate((element) => {
      const inputBox = element.getBoundingClientRect();
      const listBox = document.querySelector('[role="listbox"]')?.getBoundingClientRect();
      return listBox ? {
        inputBottom: inputBox.bottom,
        listTop: listBox.top,
        listLeft: listBox.left,
        listRight: listBox.right,
      } : null;
    });
    expect(boxes).not.toBeNull();
    expect(boxes!.listTop).toBeGreaterThanOrEqual(boxes!.inputBottom);
    expect(boxes!.listLeft).toBeGreaterThanOrEqual(0);
    expect(boxes!.listRight).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);

    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue(locale === "en" ? "Mathematics" : "Mathématiques");
    await expect(listbox).toBeHidden();
  });
}
