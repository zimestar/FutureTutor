import { test, expect, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";
import { login, logout } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";
import { adminRoutes } from "../helpers/routes";

const credentials = credentialsFor("admin");
test.skip(!credentials, "Admin E2E credentials are not configured.");

test("admin non-destructive golden path", async ({ page }) => {
  await login(page, "admin", credentials!.email, credentials!.password);
  for (const route of adminRoutes) {
    await page.goto(`/en${route}`);
    await expect(page.locator("#dashboard-main")).toBeVisible();
    await expectNoRawKeys(page);
    await expectNoDocumentOverflow(page);
  }
  await page.goto("/en/admin");
  await logout(page);
});

// QA-2 — previously EN-only; the admin role had no FR coverage at all.
test("admin non-destructive golden path (FR)", async ({ page }) => {
  await login(page, "admin", credentials!.email, credentials!.password, "fr");
  for (const route of adminRoutes) {
    await page.goto(`/fr${route}`);
    await expect(page.locator("#dashboard-main")).toBeVisible();
    await expectNoRawKeys(page);
    await expectNoDocumentOverflow(page);
  }
  await page.goto("/fr/admin");
  await logout(page, "fr");
});
