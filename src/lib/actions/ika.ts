"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveAssistantAudience } from "@/lib/assistant/access";
import { createIkaCheckout, setIkaPlanCancellation, type IkaPurchaseKind } from "@/services/ikaBilling";

/**
 * IKA-BILLING — start a Stripe Checkout for an Ika pack or the Ika+ plan,
 * and cancel / resume the plan. The return URL is built from the request's
 * own origin (checked against its host) and a fixed path per audience, never
 * from client input.
 */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) return null;
  try {
    const url = new URL(origin);
    return url.host === host ? url.origin : null;
  } catch {
    return null;
  }
}

export async function startIkaCheckoutAction(kind: IkaPurchaseKind, locale: "fr" | "en"): Promise<{ url?: string; error?: string }> {
  if (kind !== "pack" && kind !== "plan") return { error: "FAILED" };
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return { error: "UNAUTHORIZED" };
  const audience = await resolveAssistantAudience(user);
  if (!audience) return { error: "FORBIDDEN" };
  const origin = await requestOrigin();
  if (!origin) return { error: "FAILED" };
  const path = audience === "TUTOR" ? "/tutor/assistant" : "/dashboard/assistant";
  const result = await createIkaCheckout({
    userId: user.id,
    email: user.email ?? null,
    kind,
    returnUrl: `${origin}/${locale === "en" ? "en" : "fr"}${path}`,
  });
  return result.ok ? { url: result.url } : { error: result.reason };
}

export async function setIkaPlanCancellationAction(cancel: boolean): Promise<{ ok: boolean }> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !(await resolveAssistantAudience(user))) return { ok: false };
  try {
    return { ok: await setIkaPlanCancellation(user.id, cancel) };
  } catch (error) {
    console.error("[ika-billing] plan cancellation failed", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}
