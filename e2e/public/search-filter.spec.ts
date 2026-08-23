import { test, expect, expectNoDocumentOverflow } from "../fixtures/qaTest";

// QA-2 — dropdown.spec.ts already covers the chevron/select regression on
// #search-level in isolation; this covers the actual search interaction
// (submitting subject + level + mode) that no existing suite exercises,
// including that the resulting URL and results page both render safely.
test("find-tutors search filters propagate to the results URL and render safely", async ({ page }) => {
  await page.goto("/en/find-tutors");

  await page.locator("#search-subject").fill("Math");
  await page.locator("#search-level").selectOption("highSchool");
  await page.locator("#search-mode").selectOption("online");
  await page.getByRole("button", { name: /search/i }).click();

  await expect(page).toHaveURL(/subject=Math&level=highSchool&mode=online/);
  await expect(page.locator("body")).toBeVisible();
  await expectNoDocumentOverflow(page);
});
