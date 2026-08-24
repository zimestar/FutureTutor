import "server-only";
import { createHash } from "crypto";
import { dailyApiRequest, dailyApiGetRoom, dailyApiGetRoomStrict, dailyApiEjectParticipants, dailyApiDeleteRoom, dailyApiGetDomainConfig, DailyApiError } from "@/lib/dailyClient";
import { VideoProviderUnavailableError } from "@/services/videoProvider";
import type {
  VideoProviderAdapter,
  CreateRoomInput,
  CreateRoomResult,
  CreateParticipantTokenInput,
  CreateParticipantTokenResult,
  RevokeRoomAccessInput,
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
 *  - name is DETERMINISTIC (VIDEO-1B — see deterministicRoomName below),
 *    derived from CreateRoomInput.externalReference (Session_.id, never a
 *    raw Booking id) via a one-way hash — reveals nothing about the
 *    underlying identifier and, being deterministic, closes VIDEO-1A's
 *    documented orphan/duplicate-room residual risk (a retry for the same
 *    session always computes the same name, so a second attempt discovers
 *    and reuses a room a crashed first attempt already created instead of
 *    minting a second, distinct one).
 *  - No recording/transcription properties are set (VIDEO-0's approved
 *    default: no recording, no transcription in MVP).
 */

/**
 * VIDEO-1B — deterministic, one-way, collision-resistant room name. SHA-256
 * rather than embedding externalReference (Session_.id) directly: Daily
 * room names are not a secret on their own (privacy:"private" +
 * enable_knocking:false already require a valid signed token regardless of
 * whether the name is guessed), but a hash still avoids handing Daily — or
 * anyone who later sees a Daily-side room listing — FutureTutor's raw
 * internal id, and keeps the room name's format independent of whatever
 * id scheme FutureTutor happens to use. 24 hex chars (96 bits) makes
 * collision between two different Session_ ids astronomically unlikely at
 * any scale this platform will reach.
 */
function deterministicRoomName(externalReference: string): string {
  const digest = createHash("sha256").update(externalReference).digest("hex");
  return `ft-${digest.slice(0, 24)}`;
}

export function createDailyVideoProvider(): VideoProviderAdapter {
  return {
    name: "DAILY",

    async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
      const roomName = deterministicRoomName(input.externalReference);
      const roomProperties = {
        nbf: Math.floor(input.notBefore.getTime() / 1000),
        exp: Math.floor(input.expiresAt.getTime() / 1000),
        max_participants: 4, // tutor + student + up to one observing guardian, small deliberate cap
        enable_screenshare: true, // VIDEO-0/1A approved for MVP; per-participant UI gating comes in VIDEO-1B
        enable_knocking: false, // access is already gated by FutureTutor's own token issuance, not a host-approval lobby
        start_video_off: false,
        start_audio_off: false,
      };

      // VIDEO-1B — check-then-create: with a deterministic name, an
      // existing room by this exact name can only be one FutureTutor
      // already created for this exact Session_ (collision-resistant, see
      // deterministicRoomName above), so reusing it is always correct, not
      // just convenient. This also sidesteps needing to know Daily's exact
      // "name already taken" status code (undocumented/inconsistent as of
      // this writing) — reuse is decided by successfully finding the room,
      // never by parsing a specific error shape.
      const existing = await dailyApiGetRoom(roomName);
      if (existing) return { providerRoomId: existing.name };

      try {
        const room = await dailyApiRequest<{ id: string; name: string }>("/rooms", {
          name: roomName,
          privacy: "private",
          properties: roomProperties,
        });
        return { providerRoomId: room.name };
      } catch (error) {
        // The create call may have failed BECAUSE the room already exists
        // (a concurrent attempt — see VIDEO-1A's stale-claim-reclaim race —
        // won the create between our check above and this call). One final
        // existence check before treating this as a genuine failure closes
        // that race without depending on the error's exact shape.
        const racedExisting = await dailyApiGetRoom(roomName);
        if (racedExisting) return { providerRoomId: racedExisting.name };

        if (error instanceof DailyApiError) {
          throw new VideoProviderUnavailableError(`Daily room creation failed (status ${error.status})`);
        }
        throw new VideoProviderUnavailableError("Daily room creation failed: unknown error");
      }
    },

    /**
     * VIDEO-1B stale-reference fix — see VideoProviderAdapter.roomExists's
     * doc comment for the required contract. dailyApiGetRoomStrict (unlike
     * dailyApiGetRoom, used by createRoom's check-then-create reuse above)
     * preserves the found/not_found/unknown distinction all the way here,
     * which is exactly what this method needs to satisfy that contract.
     */
    async roomExists(providerRoomId: string): Promise<boolean> {
      const result = await dailyApiGetRoomStrict(providerRoomId);
      if (result.outcome === "found") return true;
      if (result.outcome === "not_found") return false;
      throw new VideoProviderUnavailableError(`Daily room existence check failed (status ${result.error.status})`);
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
        const domain = await dailyApiGetDomainConfig();
        const host = domain.domain_name.includes(".") ? domain.domain_name : `${domain.domain_name}.daily.co`;
        return {
          token: result.token,
          expiresAt: input.expiresAt,
          joinUrl: `https://${host}/${encodeURIComponent(input.providerRoomId)}`,
        };
      } catch (error) {
        if (error instanceof DailyApiError) {
          throw new VideoProviderUnavailableError(`Daily token creation failed (status ${error.status})`);
        }
        throw new VideoProviderUnavailableError("Daily token creation failed: unknown error");
      }
    },

    /**
     * VIDEO-1B — cancellation revocation. Two independent best-effort
     * steps, in order:
     *  1. Eject anyone currently connected, by explicit user_id (never an
     *     "eject everyone" default — see dailyApiEjectParticipants's doc
     *     comment). Failure here (including "nobody was connected," which
     *     Daily may or may not treat as an error — undocumented) is
     *     swallowed and does NOT prevent step 2 from being attempted; the
     *     common case is nobody is connected at all (most cancellations
     *     happen well before the join window even opens).
     *  2. Delete the room — the actual, unambiguous access-closing
     *     mechanism. This is the step whose failure is actually surfaced
     *     to the caller, since it's the one honestly capable of preventing
     *     "a previously-issued token still enables meaningful access."
     * Stated honestly, per VIDEO-1B's own instruction not to overclaim:
     * Daily's public documentation does not explicitly confirm that
     * deleting a room instantaneously disconnects an already-live WebRTC
     * session on it (only that the room ceases to exist as a joinable/
     * resolvable object) — step 1's eject is the more direct mechanism for
     * an already-connected participant, step 2 is what guarantees no NEW
     * (re)join is possible regardless. Together they are the strongest
     * mitigation this codebase can responsibly claim without Daily
     * documenting an explicit "this synchronously ends all connections"
     * guarantee for room deletion.
     */
    async revokeRoomAccess(input: RevokeRoomAccessInput): Promise<void> {
      if (input.knownParticipantUserIds.length > 0) {
        try {
          await dailyApiEjectParticipants(input.providerRoomId, input.knownParticipantUserIds);
        } catch {
          // Non-fatal — see doc comment above. Proceed to delete regardless.
        }
      }

      try {
        await dailyApiDeleteRoom(input.providerRoomId);
      } catch (error) {
        if (error instanceof DailyApiError) {
          throw new VideoProviderUnavailableError(`Daily room revocation failed (status ${error.status})`);
        }
        throw new VideoProviderUnavailableError("Daily room revocation failed: unknown error");
      }
    },
  };
}
