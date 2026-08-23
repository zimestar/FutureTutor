import { test, expect } from "../fixtures/qaTest";
import { login } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";

const credentials = credentialsFor("student");
test.skip(!credentials, "Student E2E credentials are not configured.");

// QA-2 — favorites was previously only route-render tested (golden-path.spec.ts
// visits /dashboard/favorites but never toggles anything). FavoriteButton is a
// fully reversible optimistic toggle, so this test ends in the same state it
// started in.
test("favoriting and unfavoriting a tutor is reflected on the favorites dashboard", async ({ page }) => {
  await login(page, "student", credentials!.email, credentials!.password);

  await page.goto("/en/tutors/taylor-tutor");
  const favoriteButton = page.getByRole("button", { name: /favorite/i });
  await expect(favoriteButton).toBeVisible();

  const wasFavorited = (await favoriteButton.getAttribute("aria-pressed")) === "true";
  if (wasFavorited) {
    // Leave shared staging state as found — un-favorite first so this test
    // always starts from a known "not favorited" baseline.
    await favoriteButton.click();
    await expect(favoriteButton).toHaveAttribute("aria-pressed", "false");
    await expect(favoriteButton).toBeEnabled(); // the toggle is optimistic; wait for the real server action to settle before navigating away
  }

  await favoriteButton.click();
  await expect(favoriteButton).toHaveAttribute("aria-pressed", "true");
  await expect(favoriteButton).toBeEnabled();

  // TutorCard renders only the tutor's first name as a heading (see
  // src/lib/tutorCard.ts's `firstName: user.name.split(" ")[0]`) — "Taylor",
  // not "Taylor Tutor" — and the card's only <a> is the unrelated "View
  // Profile" link, so a heading match is the correct, robust locator here.
  await page.goto("/en/dashboard/favorites");
  await expect(page.locator("#dashboard-main")).toBeVisible();
  await expect(page.getByRole("heading", { name: /taylor/i }).first()).toBeVisible();

  // Reverse the toggle from the profile page so this test is idempotent
  // across repeated runs against the same shared staging account.
  await page.goto("/en/tutors/taylor-tutor");
  const favoriteButtonAgain = page.getByRole("button", { name: /favorite/i });
  await expect(favoriteButtonAgain).toHaveAttribute("aria-pressed", "true");
  await favoriteButtonAgain.click();
  await expect(favoriteButtonAgain).toHaveAttribute("aria-pressed", "false");
  await expect(favoriteButtonAgain).toBeEnabled();

  await page.goto("/en/dashboard/favorites");
  await expect(page.locator("#dashboard-main")).toBeVisible();
  await expect(page.getByRole("heading", { name: /taylor/i })).toHaveCount(0);
});
