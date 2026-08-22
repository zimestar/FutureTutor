import { test, expect, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";
import { login, logout } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";
import { studentRoutes } from "../helpers/routes";

const credentials = credentialsFor("student");
test.skip(!credentials, "Student E2E credentials are not configured.");

test("student non-destructive golden path preserves dashboard context", async ({ page }) => {
  await login(page, "student", credentials!.email, credentials!.password);
  for (const route of studentRoutes) {
    await page.goto(`/en${route}`);
    await expect(page.locator("#dashboard-main")).toBeVisible();
    await expectNoRawKeys(page);
    await expectNoDocumentOverflow(page);
  }

  await page.goto("/en/dashboard");
  await page.getByRole("link", { name: "Find a Tutor" }).first().click();
  await expect(page).toHaveURL(/\/en\/dashboard\/find-tutors/);
  await expect(page.locator("#dashboard-main")).toBeVisible();

  const profileLink = page.locator('a[href^="/en/tutors/"]').first();
  await expect(profileLink).toBeVisible();
  await profileLink.click();
  await expect(page).toHaveURL(/\/en\/tutors\//);

  if (page.viewportSize()?.width === 375) {
    const back = page.getByRole("link", { name: "Back to Find a Tutor" });
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page).toHaveURL(/\/en\/dashboard\/find-tutors/);
    await expect(page.locator("#dashboard-main")).toBeVisible();
  }

  await page.goto("/en/dashboard");
  await logout(page);
});

test("French mobile tutor-profile return stays authenticated", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-375", "Mobile localization regression runs at 375px.");
  await login(page, "student", credentials!.email, credentials!.password, "fr");
  await page.goto("/fr/dashboard/find-tutors");
  await page.locator('a[href^="/fr/tutors/"]').first().click();
  const back = page.getByRole("link", { name: "Retour à Trouver un tuteur" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/fr\/dashboard\/find-tutors/);
  await expect(page.locator("#dashboard-main")).toBeVisible();
});
