"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  recordSessionCheckIn,
  SessionCheckInNotAuthorizedError,
  SessionCheckInTooEarlyError,
  SessionNotCheckInEligibleError,
  SessionNotFoundError,
  getSessionContext,
  resolveSessionNoShowConvergence,
} from "@/services/sessionLifecycle";

export interface SessionCheckInActionState {
  success?: boolean;
  error?: "tooEarly" | "notAuthorized" | "notEligible" | "generic";
}

export interface SessionLifecycleRefreshState {
  complete?: boolean;
}

export async function refreshSessionLifecycleAction(
  _previousState: SessionLifecycleRefreshState | undefined,
  formData: FormData,
): Promise<SessionLifecycleRefreshState> {
  const session = await auth();
  if (!session?.user) return { complete: true };
  const bookingId = formData.get("bookingId");
  const locale = formData.get("locale") === "fr" ? "fr" : "en";
  if (typeof bookingId !== "string" || !bookingId) return { complete: true };

  try {
    const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!freshUser) return { complete: true };
    await getSessionContext(bookingId, session.user.id, freshUser.role);
    await resolveSessionNoShowConvergence(bookingId);
  } catch {
    // Always fail closed and refresh the authorized read model. Never expose
    // internal lifecycle/authorization errors through this presentation aid.
  }
  revalidatePath(`/${locale}/session/${bookingId}`);
  return { complete: true };
}

export async function recordSessionCheckInAction(
  _previousState: SessionCheckInActionState | undefined,
  formData: FormData,
): Promise<SessionCheckInActionState> {
  const session = await auth();
  if (!session?.user) return { error: "notAuthorized" };

  const bookingId = formData.get("bookingId");
  const participantRole = formData.get("participantRole");
  const locale = formData.get("locale") === "fr" ? "fr" : "en";
  if (typeof bookingId !== "string" || !bookingId || (participantRole !== "TUTOR" && participantRole !== "STUDENT")) {
    return { error: "generic" };
  }

  try {
    const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!freshUser) return { error: "notAuthorized" };
    await recordSessionCheckIn(bookingId, session.user.id, participantRole, { actorRole: freshUser.role });
  } catch (error) {
    if (error instanceof SessionCheckInTooEarlyError) return { error: "tooEarly" };
    if (error instanceof SessionCheckInNotAuthorizedError) return { error: "notAuthorized" };
    if (error instanceof SessionNotCheckInEligibleError || error instanceof SessionNotFoundError) {
      revalidatePath(`/${locale}/session/${bookingId}`);
      return { error: "notEligible" };
    }
    return { error: "generic" };
  }

  revalidatePath(`/${locale}/session/${bookingId}`);
  return { success: true };
}
