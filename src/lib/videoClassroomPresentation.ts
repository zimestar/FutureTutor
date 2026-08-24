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
    ? { canPublishAudio: false, canPublishVideo: false }
    : { canPublishAudio: true, canPublishVideo: true };
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
