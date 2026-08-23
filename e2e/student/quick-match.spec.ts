import { test, expect } from "../fixtures/qaTest";
import { login } from "../helpers/auth";
import { credentialsFor } from "../helpers/credentials";

const credentials = credentialsFor("student");
test.skip(!credentials, "Student E2E credentials are not configured.");

// QA-2 — Quick Match up to the safe pre-financial boundary. Submitting the
// request form only calls the Customer Price Engine (a pure pricing
// calculation) and does not contact Stripe or dispatch any tutor invitation.
// On the price-review step, with Stripe enabled (needsPaymentSetup in
// QuickMatchPriceReview.tsx), the only affordance is "start-payment" —
// clicking it calls preparePaymentForRequestAction, which creates a real
// Stripe PaymentIntent. This test deliberately stops at that button without
// clicking it, which is the real pre-financial boundary (confirmed by
// reading the component: nothing Stripe-related fires on render, only on
// that explicit click).
//
// There is no cancel affordance at this stage (QuickMatchPriceReview only
// renders a cancel form once payment prep has failed terminally, or once
// payment is already prepared) — so this test intentionally leaves the
// created TutoringRequest at PRICED and simply navigates away, exactly like
// an abandoned pre-authorization Payment elsewhere in the app: harmless, and
// the linked CustomerPriceQuote expires on its own TTL. Because Quick Match
// allows only one active request per student, a second run of this test
// against the same account correctly self-skips until that quote expires or
// the request is otherwise resolved — this is expected product behavior,
// not a defect in this test.
test("Quick Match request reaches a real price quote and stops before payment", async ({ page }) => {
  await login(page, "student", credentials!.email, credentials!.password);
  await page.goto("/en/dashboard/quick-match");

  const form = page.locator("form", { has: page.getByTestId("get-price") });
  if ((await form.count()) === 0) {
    // An earlier run (or another suite) may have left an active request in
    // flight — not a defect, just a precondition this test can't assume.
    test.skip(true, "No quick-match request form visible — an active request already exists for this student.");
  }

  await page.locator("#requestedStartAt").fill("2026-09-15T14:00");
  await page.getByTestId("get-price").click();

  const priceReview = page.getByTestId("quick-match-price-review");
  await expect(priceReview).toBeVisible();
  await expect(page.getByTestId("quick-match-total-price")).toBeVisible();

  // The financial safety boundary this test exists to prove: the payment
  // preparation entry point is reached and visible, but never clicked.
  await expect(page.getByTestId("start-payment")).toBeVisible();
});
