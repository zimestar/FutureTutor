"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDailyVideoProvider } from "@/services/dailyVideoProvider";
import {
  BookingNotConfirmedError,
  RoomNotReadyError,
  UnauthorizedVideoParticipantError,
  VideoNotSupportedForBookingError,
  VideoSessionNotFoundError,
  VideoTooEarlyError,
  VideoWindowClosedError,
  requestVideoJoinToken,
} from "@/services/videoJoin";
import { VideoProviderUnavailableError, type VideoParticipantRole } from "@/services/videoProvider";
import { getSessionContext, SessionNotFoundError, SessionViewerNotAuthorizedError } from "@/services/sessionLifecycle";
import { VIDEO_ACCESS_GRACE_MS_AFTER_END } from "@/services/videoSession";
import { deriveVideoEntryState, type VideoEntryState } from "@/lib/videoClassroomPresentation";

export type VideoJoinActionError = "tooEarly" | "cancelled" | "ended" | "denied" | "unavailable" | "generic";

export type VideoJoinActionResult =
  | { success: true; credential: { token: string; joinUrl: string; expiresAt: string; participantRole: VideoParticipantRole } }
  | { success: false; error: VideoJoinActionError };

export async function requestVideoJoinCredentialAction(bookingId: string): Promise<VideoJoinActionResult> {
  const session = await auth();
  if (!session?.user || !bookingId) return { success: false, error: "denied" };

  const freshUser = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!freshUser) return { success: false, error: "denied" };

  try {
    const result = await requestVideoJoinToken(bookingId, session.user.id, createDailyVideoProvider(), {
      actorRole: freshUser.role,
    });
    if (!result.joinUrl) return { success: false, error: "unavailable" };
    return {
      success: true,
      credential: {
        token: result.token,
        joinUrl: result.joinUrl,
        expiresAt: result.expiresAt.toISOString(),
        participantRole: result.participantRole,
      },
    };
  } catch (error) {
    if (error instanceof VideoTooEarlyError) return { success: false, error: "tooEarly" };
    if (error instanceof BookingNotConfirmedError) return { success: false, error: "cancelled" };
    if (error instanceof VideoWindowClosedError) return { success: false, error: "ended" };
    if (error instanceof UnauthorizedVideoParticipantError || error instanceof VideoSessionNotFoundError) {
      return { success: false, error: "denied" };
    }
    if (
      error instanceof VideoProviderUnavailableError ||
      error instanceof RoomNotReadyError ||
      error instanceof VideoNotSupportedForBookingError
    ) {
      return { success: false, error: "unavailable" };
    }
    return { success: false, error: "generic" };
  }
}

export async function getVideoClassroomStateAction(bookingId: string): Promise<VideoEntryState> {
  const authSession = await auth();
  if (!authSession?.user || !bookingId) return "unavailable";
  const freshUser = await db.user.findUnique({ where: { id: authSession.user.id }, select: { role: true } });
  if (!freshUser || !["STUDENT", "TUTOR", "PARENT"].includes(freshUser.role)) return "unavailable";

  try {
    const context = await getSessionContext(bookingId, authSession.user.id, freshUser.role);
    if (["ADMIN", "SUPER_ADMIN", "DENIED"].includes(context.viewerRole)) return "unavailable";
    return deriveVideoEntryState({
      mode: context.mode,
      status: context.status,
      now: new Date(),
      opensAt: context.checkInWindowOpensAt,
      closesAt: new Date(context.scheduledEndAt.getTime() + VIDEO_ACCESS_GRACE_MS_AFTER_END),
    });
  } catch (error) {
    if (error instanceof SessionNotFoundError || error instanceof SessionViewerNotAuthorizedError) return "unavailable";
    throw error;
  }
}
