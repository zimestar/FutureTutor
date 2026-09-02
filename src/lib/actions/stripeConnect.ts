"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/appUrl";
import { paymentsUseStripe } from "@/lib/paymentMode";
import { stripeConnectOnboardingAvailable } from "@/lib/stripeConnectConfig";
import { createOnboardingLink } from "@/services/stripeConnect";

/**
 * Post-FUI-3 security hardening — the server-side authorization boundary
 * for Stripe Connect onboarding. FutureTutor policy: ONLY an APPROVED
 * Tutor may initiate Connect onboarding. role === "TUTOR" plus TutorProfile
 * existence are NOT sufficient on their own — a tutor still mid-pipeline
 * (e.g. DRAFT/TRAINING_REQUIRED/FINAL_REVIEW) or no longer eligible
 * (REJECTED/SUSPENDED) must never reach stripe.accounts.create()/
 * stripe.accountLinks.create(), and must never have Connect state
 * persisted. applicationStatus is read fresh from the authoritative
 * TutorProfile row below on every call — never inferred from the session,
 * client input, or frontend page/nav visibility (which is not an
 * authorization boundary). Both guards below fail closed: on denial, no
 * Stripe call is made and no TutorProfile Connect field is touched.
 */
export async function startStripeOnboardingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return;

  // BETA-LAUNCHFIX1 — checked before any database read, matching this
  // codebase's established early-rejection discipline (e.g. BETA-AGE1's
  // age-eligibility check, BETA-PRICINGFIX1's academic-level requiredness).
  // A normal tutor never reaches this branch — /tutor/payouts doesn't render
  // the CTA while Connect is unavailable — so this fires only for a
  // crafted/direct invocation, which is exactly what it exists to stop. The
  // true authoritative backstop is ensureConnectAccount's own check
  // (services/stripeConnect.ts) — this is the fast, cheap first line of
  // defense, not the only one.
  if (!stripeConnectOnboardingAvailable()) return;

  const locale = String(formData.get("locale") ?? "en");
  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return;
  if (tutorProfile.applicationStatus !== "APPROVED") return;

  // Mirrors every other Stripe-touching Server Action's established
  // paymentsUseStripe() gate (see lib/actions/payments.ts, lib/actions/
  // bookings.ts) — getStripeClient() already refuses to construct a client
  // under disabled_dev as a defense-in-depth backstop, but every call site
  // is expected to check explicitly first rather than rely on that
  // exception path.
  if (!paymentsUseStripe()) {
    console.error("Stripe Connect onboarding attempted while payments are disabled (PAYMENT_MODE=disabled_dev)");
    redirect(`/${locale}/tutor/payouts?onboarding=error`);
  }

  const baseUrl = await getAppBaseUrl();
  const returnUrl = `${baseUrl}/${locale}/tutor/payouts?onboarding=return`;
  const refreshUrl = `${baseUrl}/${locale}/tutor/payouts?onboarding=refresh`;

  let url: string;
  try {
    url = await createOnboardingLink(tutorProfile.id, returnUrl, refreshUrl);
  } catch (error) {
    console.error("Failed to create Stripe onboarding link", error);
    redirect(`/${locale}/tutor/payouts?onboarding=error`);
  }
  redirect(url);
}
