import type { Page } from "@playwright/test";
import type { E2ERole } from "./credentials";

const homeByRole: Record<E2ERole, RegExp> = {
  student: /\/(en|fr)\/dashboard(?:\?.*)?$/,
  tutor: /\/(en|fr)\/tutor\/dashboard(?:\?.*)?$/,
  admin: /\/(en|fr)\/admin(?:\?.*)?$/,
};

export async function login(page: Page, role: E2ERole, email: string, password: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/email|courriel/i).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(homeByRole[role]);
}

export async function logout(page: Page, locale = "en") {
  const visibleLogout = page.locator('form button[type="submit"]:visible').filter({
    hasText: locale === "fr" ? "Se déconnecter" : "Log out",
  });

  if (await visibleLogout.count() === 0) {
    await page.locator('button[aria-controls="dashboard-mobile-navigation"]').click();
  }

  await visibleLogout.click();
  await page.waitForURL(new RegExp(`/${locale}/?$`));
}
