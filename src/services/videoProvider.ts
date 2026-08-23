import "server-only";

/**
 * VIDEO-1A — thin video-call provider abstraction. Business logic
 * (videoSession.ts's room provisioning, videoJoinAuthorization.ts's token
 * issuance) depends ONLY on this interface, never on a provider-specific
 * SDK/API shape. This is what makes a future provider swap (see the VIDEO-0
 * architecture report's LiveKit comparison) a new adapter file, not a
 * rewrite of session authorization/business logic.
 *
 * Every method is a pure server-side network call — no Prisma, no session
 * lookups, no authorization decisions. Those stay in the calling services,
 * which are the only code that knows about FutureTutor's own domain model
 * (Booking/Session_).
 */

export type VideoProviderName = "DAILY";

export interface CreateRoomInput {
  /** A short-lived, internal, non-guessable identifier folded into the
   * provider's own room name — never a bookingId/Session_.id directly (see
   * the security model: provider room identifiers must never double as an
   * authorization mechanism, so there's no benefit to a human-legible name,
   * only downside). */
  externalReference: string;
  /** The room becomes enterable no earlier than this instant, enforced by
   * the provider itself (defense-in-depth alongside FutureTutor's own
   * server-side join-window check — see videoJoinAuthorization.ts). */
  notBefore: Date;
  /** The room (and any token issued for it) stops being valid at/after this
   * instant — the provider is expected to auto-expire/reclaim the room. */
  expiresAt: Date;
}

export interface CreateRoomResult {
  /** The single, sufficient reference for this room, persisted as
   * Session_.providerRoomId and reused, unmodified, as the `room_name`
   * input to createParticipantToken below — deliberately one identifier
   * throughout rather than a separate internal-id/room-name pair, since
   * FutureTutor's own domain never needs to distinguish them and every
   * extra identifier is one more thing to keep in sync. Never returned to
   * a client directly; only ever consumed server-side. */
  providerRoomId: string;
}

export type VideoParticipantRole = "TUTOR" | "STUDENT" | "OBSERVER";

export interface CreateParticipantTokenInput {
  providerRoomId: string;
  /** A stable, non-PII identifier for the participant, used only for the
   * provider's own session bookkeeping (e.g. distinguishing rejoins) —
   * never the participant's email or display name. */
  participantExternalId: string;
  role: VideoParticipantRole;
  /** Token (and thus join eligibility) expires at/before this instant —
   * always derived from FutureTutor's own join-window calculation, never
   * provider-side defaults. */
  expiresAt: Date;
  notBefore: Date;
}

export interface CreateParticipantTokenResult {
  token: string;
  expiresAt: Date;
}

export interface VideoProviderAdapter {
  readonly name: VideoProviderName;
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  createParticipantToken(input: CreateParticipantTokenInput): Promise<CreateParticipantTokenResult>;
}

export class VideoProviderUnavailableError extends Error {}
