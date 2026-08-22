import { test, expect, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";
import { login, logout } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";
import { tutorRoutes } from "../helpers/routes";

const credentials = credentialsFor("tutor");
test.skip(!credentials, "Tutor E2E credentials are not configured.");

test("tutor non-destructive golden path", async ({ page }) => {
  await login(page, "tutor", credentials!.email, credentials!.password);
  for (const route of tutorRoutes) {
    await page.goto(`/en${route}`);
    await expect(page.locator("#dashboard-main")).toBeVisible();
    await expectNoRawKeys(page);
    await expectNoDocumentOverflow(page);
  }
  await page.goto("/en/tutor/payouts");
  await expect(page.getByTestId("start-stripe-onboarding")).toBeVisible();
  await page.goto("/en/tutor/dashboard");
  await logout(page);
});
