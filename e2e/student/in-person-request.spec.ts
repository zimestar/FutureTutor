import { test, expect } from "../fixtures/qaTest";
import { login } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";

const credentials = credentialsFor("student");
test.skip(!credentials, "Student E2E credentials are not configured.");

for (const locale of ["en", "fr"] as const) {
  test(`${locale} Quick Match reveals the accessible in-person location step without overflow`, async ({ page }) => {
    await login(page, "student", credentials!.email, credentials!.password, locale);
    // The authenticated dashboard can refresh its RSC tree immediately
    // after login. Waiting only for the navigation commit avoids treating
    // that expected frame replacement as a failed full-load navigation.
    await page.goto(`/${locale}/dashboard/quick-match?newRequest=1`, { waitUntil: "commit" });
    await page.waitForURL(new RegExp(`/${locale}/dashboard/quick-match`));

    const submit = page.getByTestId("get-price");
    if ((await submit.count()) === 0) {
      test.skip(true, "No Quick Match request form is available for this synthetic student.");
    }

    const online = page.getByRole("radio", { name: locale === "en" ? "Online" : "En ligne" });
    const inPerson = page.getByRole("radio", { name: locale === "en" ? "In person" : "En présentiel" });
    await expect(online).toBeChecked();
    await expect(page.getByTestId("in-person-location-fields")).toBeHidden();

    await inPerson.focus();
    await page.keyboard.press("Space");
    await expect(inPerson).toBeChecked();
    await expect(page.getByTestId("in-person-location-fields")).toBeVisible();
    await expect(page.locator("#addressLine1")).toHaveAccessibleName(locale === "en" ? "Address line 1" : "Adresse — ligne 1");
    await expect(page.locator("#postalCode")).toHaveAccessibleName(locale === "en" ? "Postal code" : "Code postal");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
