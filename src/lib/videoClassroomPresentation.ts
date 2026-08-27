import type { SessionStatus, TutoringMode } from "@/generated/prisma/enums";
import type { VideoParticipantRole } from "@/services/videoProvider";

export type VideoEntryState = "tooEarly" | "ready" | "cancelled" | "ended" | "unavailable";
export type VideoConnectionState = "prejoin" | "connecting" | "connected" | "reconnecting" | "disconnected";

export function deriveVideoEntryState(input: {
  mode: TutoringMode;
  status: SessionStatus;
  now: Date;
  opensAt: Date;
  closesAt: Date;
}): VideoEntryState {
  if (input.status === "CANCELLED") return "cancelled";
  if (input.mode === "IN_PERSON") return "unavailable";
  if (["COMPLETED", "INTERRUPTED", "NO_SHOW"].includes(input.status) || input.now > input.closesAt) return "ended";
  if (input.now < input.opensAt) return "tooEarly";
  return "ready";
}

export function controlsForVideoRole(role: VideoParticipantRole) {
  return role === "OBSERVER"
    ? { canPublishAudio: false, canPublishVideo: false, canShareScreen: false }
    : { canPublishAudio: true, canPublishVideo: true, canShareScreen: true };
}

/** VIDEO-2A — pure, presentational only: minutes until the authoritative
 * session end (Session/Booking-derived `scheduledEndAt`, already computed
 * server-side). Clamped at 0 once past end. Never used to decide session
 * completion/no-show — the server remains authoritative for that. */
export function minutesRemainingInSession(scheduledEndAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((scheduledEndAt.getTime() - now.getTime()) / 60_000));
}

/** VIDEO-2A — whether the time-remaining indicator should become slightly
 * more noticeable (still presentational, never controls lifecycle). */
export function isSessionEndingSoon(remainingMinutes: number): boolean {
  return remainingMinutes > 0 && remainingMinutes <= 10;
}

/** VIDEO-2A — resolves a Daily participant's FutureTutor role from the
 * `userData` tag set at `call.join({ userData: { role } })`. Pure and
 * defensive: `userData` is `unknown` by the Daily SDK's own typing and is
 * never trusted beyond this narrow shape check — an unrecognized/missing
 * shape resolves to `null` rather than throwing or guessing. This is
 * presentation-layer identity only (which grid slot a tile renders into);
 * it grants no capability — publish/screen-share authority remains
 * enforced entirely by the server-issued Daily token (dailyVideoProvider). */
export function resolveParticipantRoleFromUserData(userData: unknown): VideoParticipantRole | null {
  if (userData && typeof userData === "object" && "role" in userData) {
    const role = (userData as { role?: unknown }).role;
    if (role === "TUTOR" || role === "STUDENT" || role === "OBSERVER") return role;
  }
  return null;
}

export function formatCallDuration(elapsedSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function presentConnectionState(event: string): VideoConnectionState | null {
  const normalized = event.toLowerCase();
  if (normalized.includes("reconnect") || normalized.includes("interrupted")) return "reconnecting";
  if (normalized.includes("disconnect") || normalized.includes("failed")) return "disconnected";
  if (normalized.includes("connected")) return "connected";
  return null;
}
