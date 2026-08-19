"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseInterruptionActionInput, parseSessionActionIdentity } from "@/lib/sessionActionInput";
import {
  recordSessionCheckIn,
  SessionCheckInNotAuthorizedError,
  SessionCheckInTooEarlyError,
  SessionNotCheckInEligibleError,
  SessionNotFoundError,
  getSessionContext,
  resolveSessionNoShowConvergence,
  requestSessionCompletionConvergence,
  requestSessionInterruption,
  SessionInterruptionNotAuthorizedError,
  SessionNotInterruptibleError,
  SessionViewerNotAuthorizedError,
} from "@/services/sessionLifecycle";

export interface SessionCheckInActionState {
  success?: boolean;
  error?: "tooEarly" | "notAuthorized" | "notEligible" | "generic";
}

export interface SessionLifecycleRefreshState {
  complete?: boolean;
}

export interface SessionCompletionRefreshState {
  complete?: boolean;
  error?: "notAuthorized" | "notEligible" | "generic";
}

export interface SessionInterruptionActionState {
  success?: boolean;
  error?: "notAuthorized" | "notEligible" | "generic";
}

export async function requestSessionCompletionAction(
  _previousState: SessionCompletionRefreshState | undefined,
  formData: FormData,
): Promise<SessionCompletionRefreshState> {
  const session = await auth();
  if (!session?.user) return { error: "notAuthorized" };
  const input = parseSessionActionIdentity(formData);
  if (!input) return { error: "generic" };

  try {
    const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!freshUser) return { error: "notAuthorized" };
    await requestSessionCompletionConvergence(input.bookingId, session.user.id, freshUser.role);
  } catch (error) {
    if (error instanceof SessionViewerNotAuthorizedError) return { error: "notAuthorized" };
    if (error instanceof SessionNotFoundError) return { error: "notEligible" };
    return { error: "generic" };
  }

  revalidatePath(`/${input.locale}/session/${input.bookingId}`);
  return { complete: true };
}

export async function requestSessionInterruptionAction(
  _previousState: SessionInterruptionActionState | undefined,
  formData: FormData,
): Promise<SessionInterruptionActionState> {
  const session = await auth();
  if (!session?.user) return { error: "notAuthorized" };
  const input = parseInterruptionActionInput(formData);
  if (!input) return { error: "generic" };

  try {
    const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (!freshUser) return { error: "notAuthorized" };
    await requestSessionInterruption(input.bookingId, session.user.id, { actorRole: freshUser.role, reason: input.reason });
  } catch (error) {
    if (error instanceof SessionViewerNotAuthorizedError || error instanceof SessionInterruptionNotAuthorizedError) {
      return { error: "notAuthorized" };
    }
    if (error instanceof SessionNotFoundError || error instanceof SessionNotInterruptibleError) {
      revalidatePath(`/${input.locale}/session/${input.bookingId}`);
      return { error: "notEligible" };
    }
    return { error: "generic" };
  }

  revalidatePath(`/${input.locale}/session/${input.bookingId}`);
  return { success: true };
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
