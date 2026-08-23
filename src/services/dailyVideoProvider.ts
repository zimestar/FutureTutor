import "server-only";
import { randomUUID } from "crypto";
import { dailyApiRequest, DailyApiError } from "@/lib/dailyClient";
import { VideoProviderUnavailableError } from "@/services/videoProvider";
import type {
  VideoProviderAdapter,
  CreateRoomInput,
  CreateRoomResult,
  CreateParticipantTokenInput,
  CreateParticipantTokenResult,
} from "@/services/videoProvider";

/**
 * VIDEO-1A — Daily.co implementation of VideoProviderAdapter. Verified
 * against Daily's current (2026) REST API documentation:
 *   POST https://api.daily.co/v1/rooms
 *   POST https://api.daily.co/v1/meeting-tokens
 *
 * Room shape decisions:
 *  - privacy: "private" — a room URL alone is never sufficient to join;
 *    Daily requires a valid meeting token for a private room. This is the
 *    provider-level half of the "room identifiers are not an authorization
 *    mechanism" requirement — FutureTutor's own server-side join-window/
 *    authorization check (videoJoinAuthorization.ts) is the other half.
 *  - properties.nbf / properties.exp mirror FutureTutor's own join-window
 *    boundaries exactly (passed in by the caller — see videoSession.ts),
 *    so even a hypothetical bug in FutureTutor's own authorization layer
 *    would still be independently rejected by Daily itself outside that
 *    window (defense in depth, not the primary control).
 *  - name is a random, non-guessable identifier that reveals nothing about
 *    the underlying Booking/Session_ (never a bookingId/Session_.id
 *    directly) — matches CreateRoomInput.externalReference's own doc
 *    comment.
 *  - No recording/transcription properties are set (VIDEO-0's approved
 *    default: no recording, no transcription in MVP).
 */
export function createDailyVideoProvider(): VideoProviderAdapter {
  return {
    name: "DAILY",

    async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
      const roomName = `ft-${input.externalReference}-${randomUUID().slice(0, 8)}`;
      try {
        const room = await dailyApiRequest<{ id: string; name: string }>("/rooms", {
          name: roomName,
          privacy: "private",
          properties: {
            nbf: Math.floor(input.notBefore.getTime() / 1000),
            exp: Math.floor(input.expiresAt.getTime() / 1000),
            max_participants: 4, // tutor + student + up to one observing guardian, small deliberate cap
            enable_screenshare: true, // VIDEO-0/1A approved for MVP; per-participant UI gating comes in VIDEO-1B
            enable_knocking: false, // access is already gated by FutureTutor's own token issuance, not a host-approval lobby
            start_video_off: false,
            start_audio_off: false,
          },
        });
        return { providerRoomId: room.name };
      } catch (error) {
        if (error instanceof DailyApiError) {
          throw new VideoProviderUnavailableError(`Daily room creation failed (status ${error.status})`);
        }
        throw new VideoProviderUnavailableError("Daily room creation failed: unknown error");
      }
    },

    async createParticipantToken(input: CreateParticipantTokenInput): Promise<CreateParticipantTokenResult> {
      const isObserver = input.role === "OBSERVER";
      try {
        const result = await dailyApiRequest<{ token: string }>("/meeting-tokens", {
          properties: {
            room_name: input.providerRoomId,
            user_id: input.participantExternalId,
            is_owner: input.role === "TUTOR",
            exp: Math.floor(input.expiresAt.getTime() / 1000),
            nbf: Math.floor(input.notBefore.getTime() / 1000),
            eject_at_token_exp: true,
            enable_screenshare: !isObserver,
            start_video_off: isObserver,
            start_audio_off: isObserver,
            // Structural restriction, not just a default state a Parent
            // observer could later toggle on — VIDEO-1A's approved product
            // rule is "passive observer," enforced by the provider itself:
            // an OBSERVER token can never publish audio/video/screen and
            // never gets admin (moderation) capability, regardless of
            // client-side UI.
            permissions: isObserver
              ? { hasPresence: true, canSend: [], canAdmin: false }
              : undefined,
          },
        });
        return { token: result.token, expiresAt: input.expiresAt };
      } catch (error) {
        if (error instanceof DailyApiError) {
          throw new VideoProviderUnavailableError(`Daily token creation failed (status ${error.status})`);
        }
        throw new VideoProviderUnavailableError("Daily token creation failed: unknown error");
      }
    },
  };
}
