import { test, expect } from "../fixtures/qaTest";

const labels = {
  en: { show: "Show password", hide: "Hide password" },
  fr: { show: "Afficher le mot de passe", hide: "Masquer le mot de passe" },
};

for (const locale of ["en", "fr"] as const) {
  for (const route of ["login", "signup"] as const) {
    test(`${locale} ${route} password visibility is accessible and value-preserving`, async ({ page }) => {
      await page.goto(`/${locale}/${route}`);
      const password = page.locator('input[name="password"]');
      await password.fill("VisibleOnlyInBrowser123!");
      await expect(password).toHaveAttribute("type", "password");

      const show = page.getByRole("button", { name: labels[locale].show });
      await show.focus();
      await expect(show).toBeFocused();
      await show.press("Enter");
      await expect(password).toHaveAttribute("type", "text");
      await expect(password).toHaveValue("VisibleOnlyInBrowser123!");

      const hide = page.getByRole("button", { name: labels[locale].hide });
      await hide.click();
      await expect(password).toHaveAttribute("type", "password");
      await expect(password).toHaveValue("VisibleOnlyInBrowser123!");
      await expect(page).toHaveURL(new RegExp(`/${locale}/${route}$`));
    });
  }
}
