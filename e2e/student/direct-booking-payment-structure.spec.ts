import { test, expect } from "../fixtures/qaTest";
import { login } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";

const credentials = credentialsFor("student");
test.skip(!credentials, "Student E2E credentials are not configured.");

// Regression coverage for a P1 where StripePaymentForm's own <form> was
// rendered as a DOM descendant of BookingWidget's outer booking-creation
// <form> — invalid nested-form HTML that silently prevented Stripe
// confirmation from ever reaching Stripe. This asserts the real rendered
// DOM structure (not just source text) stays correct, and stops at the
// payment step — no card is entered, no PaymentIntent is confirmed.
test("Direct Booking payment step renders no nested form", async ({ page }) => {
  await login(page, "student", credentials!.email, credentials!.password);

  await page.goto("/en/tutors/taylor-tutor");
  await expect(page.locator('[data-testid^="day-tab-"]').first()).toBeVisible();
  await page.locator('[data-testid^="day-tab-"]').first().click();
  await expect(page.locator('[data-testid="time-slot"]').first()).toBeVisible();
  await page.locator('[data-testid="time-slot"]').first().click();

  // Payment preparation is asynchronous (a real quote, then a real
  // PaymentIntent, are created server-side) — wait for the actual Stripe
  // Payment Element iframe to mount rather than a fixed delay.
  const stripeForm = page.locator('[data-testid="stripe-payment-form"]');
  await expect(stripeForm).toBeVisible({ timeout: 20_000 });
  await expect(stripeForm.locator("iframe").first()).toBeVisible();

  // The structural assertion this test exists for: no <form> anywhere in
  // the rendered DOM contains another <form> as a descendant.
  const nestedFormCount = await page.locator("form form").count();
  expect(nestedFormCount).toBe(0);

  // The Stripe payment form's own <form> (data-testid is on the <form>
  // element itself) must have zero ENCLOSING forms — xpath's ancestor::
  // axis never includes the context node itself, so this is 0 precisely
  // because the fix removed BookingWidget's outer wrapping <form>. Before
  // the fix this count was 1 (the outer booking-creation form).
  const stripeFormAncestorForms = await stripeForm.locator("xpath=ancestor::form").count();
  expect(stripeFormAncestorForms).toBe(0);

  // Intentionally stop here — no card details are entered and no payment
  // is confirmed. runtimeAudit (auto-applied via the qaTest fixture)
  // asserts no console/page errors occurred, which would catch React's own
  // validateDOMNesting warning if a nested form ever regressed.
});
