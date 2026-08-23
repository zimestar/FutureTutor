import { test, expect } from "../fixtures/qaTest";
import { login } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";

// QA-2 — role-authorization boundary coverage for src/proxy.ts's
// protectedSection guard, plus 404 behavior. Not previously covered by any
// QA-1 suite (golden-path specs only ever visit routes a role IS allowed to
// use).

test.describe("unauthenticated access redirects to login", () => {
  for (const [section, path] of [
    ["dashboard", "/dashboard"],
    ["tutor", "/tutor/dashboard"],
    ["admin", "/admin"],
  ] as const) {
    test(`${section} section redirects an unauthenticated visitor to login`, async ({ page }) => {
      await page.goto(`/en${path}`);
      await expect(page).toHaveURL(/\/en\/login$/);
    });
  }
});

test.describe("cross-role access redirects to the user's own home", () => {
  const cases = [
    { role: "student" as const, blockedPath: "/admin", expectedHome: /\/en\/dashboard(?:\?.*)?$/ },
    { role: "student" as const, blockedPath: "/tutor/dashboard", expectedHome: /\/en\/dashboard(?:\?.*)?$/ },
    { role: "tutor" as const, blockedPath: "/admin", expectedHome: /\/en\/tutor\/dashboard(?:\?.*)?$/ },
    { role: "tutor" as const, blockedPath: "/dashboard", expectedHome: /\/en\/tutor\/dashboard(?:\?.*)?$/ },
    { role: "admin" as const, blockedPath: "/dashboard", expectedHome: /\/en\/admin(?:\?.*)?$/ },
    { role: "admin" as const, blockedPath: "/tutor/dashboard", expectedHome: /\/en\/admin(?:\?.*)?$/ },
  ];

  for (const { role, blockedPath, expectedHome } of cases) {
    const credentials = credentialsFor(role);
    test.skip(!credentials, `${role} E2E credentials are not configured.`);

    test(`${role} hitting ${blockedPath} is redirected to their own home, not an error page`, async ({ page }) => {
      await login(page, role, credentials!.email, credentials!.password);
      await page.goto(`/en${blockedPath}`);
      await expect(page).toHaveURL(expectedHome);
    });
  }
});

test.describe("404 behavior", () => {
  for (const locale of ["en", "fr"] as const) {
    test(`${locale} unknown route renders the not-found page, not a 500`, async ({ page }) => {
      const response = await page.goto(`/${locale}/this-route-does-not-exist-qa2`);
      expect(response?.status()).toBe(404);
      await expect(page.locator("body")).toBeVisible();
    });

    test(`${locale} unknown tutor slug renders the not-found page, not a 500`, async ({ page }) => {
      const response = await page.goto(`/${locale}/tutors/no-such-tutor-qa2`);
      expect(response?.status()).toBe(404);
      await expect(page.locator("body")).toBeVisible();
    });
  }
});
