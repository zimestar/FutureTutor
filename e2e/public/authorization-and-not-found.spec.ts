import { test, expect, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";
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

// UX-404 — permanent regression coverage for the confirmed defect: both
// src/app/global-not-found.tsx (genuinely unmatched routes, exercised
// below) and src/app/[locale]/not-found.tsx (an explicit notFound() thrown
// from a matched route, e.g. an invalid tutor slug) must render
// FutureTutor's own branded/localized UI, never Next.js's generic
// unbranded "This page could not be found." fallback.
const brandedCopy = {
  en: { heading: "Page not found", homeCta: "Back to Home", findTutorCta: "Find a Tutor" },
  fr: { heading: "Page introuvable", homeCta: "Retour à l'accueil", findTutorCta: "Trouver un tuteur" },
} as const;

test.describe("404 behavior", () => {
  for (const locale of ["en", "fr"] as const) {
    const copy = brandedCopy[locale];

    test(`${locale} unknown route renders the branded/localized 404, not Next's generic fallback`, async ({ page }) => {
      const response = await page.goto(`/${locale}/this-route-does-not-exist-qa2`);
      expect(response?.status()).toBe(404);

      // Scoped to #main — [locale]/not-found.tsx renders inside the full
      // MarketingShell, whose Footer also has its own "Find a Tutor" nav
      // link with the same accessible name; the CTA under test is this
      // page's own content, not the site-wide footer nav.
      const main = page.locator("#main");
      await expect(main.getByRole("heading", { name: copy.heading })).toBeVisible();
      await expect(page.getByText("This page could not be found.")).toHaveCount(0);
      await expect(main.getByRole("link", { name: copy.homeCta })).toHaveAttribute("href", `/${locale}`);
      await expect(main.getByRole("link", { name: copy.findTutorCta })).toHaveAttribute(
        "href",
        `/${locale}/find-tutors`
      );
      await expectNoRawKeys(page);
      await expectNoDocumentOverflow(page);
    });

    test(`${locale} unknown tutor slug renders the branded/localized 404, not Next's generic fallback`, async ({ page }) => {
      const response = await page.goto(`/${locale}/tutors/no-such-tutor-qa2`);
      expect(response?.status()).toBe(404);

      // Scoped to #main — [locale]/not-found.tsx renders inside the full
      // MarketingShell, whose Footer also has its own "Find a Tutor" nav
      // link with the same accessible name; the CTA under test is this
      // page's own content, not the site-wide footer nav.
      const main = page.locator("#main");
      await expect(main.getByRole("heading", { name: copy.heading })).toBeVisible();
      await expect(page.getByText("This page could not be found.")).toHaveCount(0);
      await expect(main.getByRole("link", { name: copy.homeCta })).toHaveAttribute("href", `/${locale}`);
      await expect(main.getByRole("link", { name: copy.findTutorCta })).toHaveAttribute(
        "href",
        `/${locale}/find-tutors`
      );
      await expectNoRawKeys(page);
      await expectNoDocumentOverflow(page);
    });
  }
});
