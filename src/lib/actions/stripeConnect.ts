"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/appUrl";
import { createOnboardingLink } from "@/services/stripeConnect";

export async function startStripeOnboardingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TUTOR") return;

  const locale = String(formData.get("locale") ?? "en");
  const tutorProfile = await db.tutorProfile.findUnique({ where: { userId: session.user.id } });
  if (!tutorProfile) return;

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
