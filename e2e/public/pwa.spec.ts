import { credentialsFor } from "../helpers/credentials";
import { login, logout } from "../helpers/auth";
import { expect, expectNoDocumentOverflow, test } from "../fixtures/qaTest";

test("manifest and branded install assets are served with valid metadata", async ({ page, request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "FutureTutor",
    short_name: "FutureTutor",
    start_url: "/launch",
    scope: "/",
    display: "standalone",
  });

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok(), icon.src).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }

  await page.goto("/launch");
  await expect(page).toHaveURL(/\/en\/login/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#2563eb");
});

const student = credentialsFor("student");
test("authenticated install entry is localized and iOS guidance is honest", async ({ page }, testInfo) => {
  test.skip(!student, "Student E2E credentials are not configured.");
  test.skip(testInfo.project.name !== "chromium-375", "Install interaction runs at the highest-risk mobile width.");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
    Object.defineProperty(navigator, "platform", { configurable: true, get: () => "iPhone" });
  });
  await login(page, "student", student!.email, student!.password, "fr");
  await page.locator('button[aria-controls="dashboard-mobile-navigation"]').click();
  const action = page.getByRole("button", { name: "Installer FutureTutor" });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.getByRole("dialog", { name: "Ajouter FutureTutor à l’écran d’accueil" })).toBeVisible();
  await expect(page.getByText("Touchez le bouton Partager dans Safari.")).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("install action invokes a captured Android prompt only after an explicit click", async ({ page }, testInfo) => {
  test.skip(!student, "Student E2E credentials are not configured.");
  test.skip(testInfo.project.name !== "chromium-375", "Install interaction runs once at mobile width.");
  await login(page, "student", student!.email, student!.password);
  await page.locator('button[aria-controls="dashboard-mobile-navigation"]').click();
  const installAction = page.getByRole("button", { name: "Install FutureTutor" });
  await expect(installAction).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __pwaPromptCalls?: number }).__pwaPromptCalls = 0;
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted"; platform: string }>;
    };
    event.prompt = async () => { (window as typeof window & { __pwaPromptCalls?: number }).__pwaPromptCalls! += 1; };
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    window.dispatchEvent(event);
  });
  await installAction.click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __pwaPromptCalls?: number }).__pwaPromptCalls)).toBe(1);
});

test("install action is absent in standalone display mode", async ({ page }, testInfo) => {
  test.skip(!student, "Student E2E credentials are not configured.");
  test.skip(testInfo.project.name !== "chromium-375", "Standalone visibility runs once at mobile width.");
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => query === "(display-mode: standalone)"
      ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true }
      : original(query);
  });
  await login(page, "student", student!.email, student!.password);
  await page.locator('button[aria-controls="dashboard-mobile-navigation"]').click();
  await expect(page.getByRole("button", { name: "Install FutureTutor" })).toHaveCount(0);
});

const tutor = credentialsFor("tutor");
test("logout and account switch cannot reveal the previous dashboard through a PWA cache", async ({ page }, testInfo) => {
  test.skip(!student || !tutor, "Student and Tutor E2E credentials are not configured.");
  test.skip(testInfo.project.name !== "chromium-375", "Account-switch privacy regression runs once at mobile width.");
  await login(page, "student", student!.email, student!.password);
  await page.goto("/en/dashboard/bookings");
  await logout(page);
  await login(page, "tutor", tutor!.email, tutor!.password);
  await page.goto("/launch");
  await expect(page).toHaveURL(/\/en\/tutor\/dashboard/);
  await page.goto("/en/dashboard/bookings");
  await expect(page).toHaveURL(/\/en\/tutor\/dashboard/);
  await expect(page.locator("#dashboard-main")).toBeVisible();
});
