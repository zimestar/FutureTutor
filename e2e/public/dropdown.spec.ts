import { test, expect, expectNoDocumentOverflow } from "../fixtures/qaTest";

test("shared select uses a non-intercepting chevron and remains operable", async ({ page }) => {
  await page.goto("/en/find-tutors");
  const select = page.locator("#search-level");
  const wrapper = select.locator("..");
  const chevron = wrapper.locator("svg");
  await expect(select).toBeVisible();
  await select.focus();
  await expect(select).toBeFocused();
  await select.selectOption("highSchool");
  await expect(select).toHaveValue("highSchool");
  await expect(chevron).toBeVisible();
  await expect(chevron).toHaveCSS("pointer-events", "none");
  const selectBox = await select.boundingBox();
  const chevronBox = await chevron.boundingBox();
  expect(selectBox).not.toBeNull();
  expect(chevronBox).not.toBeNull();
  expect(chevronBox!.x).toBeGreaterThan(selectBox!.x + selectBox!.width / 2);
  await expectNoDocumentOverflow(page);
});
