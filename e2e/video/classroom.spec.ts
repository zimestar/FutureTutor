import { test, expect, expectNoDocumentOverflow, expectNoRawKeys } from "../fixtures/qaTest";
import { login } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";

test.describe.configure({ timeout: 120_000 });

test("classroom route fails closed for an unauthenticated browser", async ({ page }) => {
  await page.goto("/en/session/not-a-booking/classroom");
  await expect(page).toHaveURL(/\/en\/login/);
  await expectNoDocumentOverflow(page);
  await expectNoRawKeys(page);
});

const student = credentialsFor("student");
test("Student session exposes a secure classroom boundary without joining Daily", async ({ page }) => {
  test.skip(!student, "Student E2E credentials are not configured.");
  await login(page, "student", student!.email, student!.password);
  await page.goto("/en/dashboard/bookings");
  const sessionLink = page.locator('a[href*="/session/"]').first();
  test.skip(await sessionLink.count() === 0, "No safe session fixture is available for classroom navigation.");
  const sessionHref = await sessionLink.getAttribute("href");
  expect(sessionHref).toBeTruthy();
  await sessionLink.click();
  await expect(page.locator("#dashboard-main")).toBeVisible();
  await expectNoRawKeys(page);
  await expectNoDocumentOverflow(page);

  const classroomLink = page.getByRole("link", { name: "Open classroom" });
  if (await classroomLink.count()) await classroomLink.click();
  else await page.goto(`${sessionHref}/classroom`);
  await expect(page.locator("main")).toBeVisible();
  if (await page.getByTestId("video-classroom").count()) {
    await expect(page.getByTestId("video-prejoin")).toBeVisible();
    await expect(page.getByTestId("join-video-session")).toBeVisible();
  } else {
    await expect(page.getByRole("link", { name: "Back to session" })).toBeVisible();
  }
  await expectNoRawKeys(page);
  await expectNoDocumentOverflow(page);
  // Deliberately stop at prejoin: the deterministic suite never requests a
  // Daily token, creates attendance evidence, or joins an external room.
});

test("French mobile classroom boundary is localized", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-375", "French classroom smoke runs at the highest-risk mobile width.");
  test.skip(!student, "Student E2E credentials are not configured.");
  await login(page, "student", student!.email, student!.password, "fr");
  await page.goto("/fr/dashboard/bookings");
  const sessionLink = page.locator('a[href*="/session/"]').first();
  test.skip(await sessionLink.count() === 0, "No safe session fixture is available for classroom navigation.");
  const sessionHref = await sessionLink.getAttribute("href");
  expect(sessionHref).toBeTruthy();
  await page.goto(`${sessionHref}/classroom`);
  await expect(page.locator("main")).toBeVisible();
  await expectNoRawKeys(page);
  await expectNoDocumentOverflow(page);
  await expect(page.getByRole("link", { name: "Retour à la séance" })).toBeVisible();
});
