import "server-only";
import { db } from "@/lib/db";
import { confirmVideoParticipantJoined } from "@/services/videoJoin";
import { writeAuditLog } from "@/lib/audit";

/**
 * VIDEO-1B — Daily webhook business-event processing. Called only AFTER
 * verifyDailyWebhookSignature (src/lib/dailyWebhookSignature.ts) has
 * already fail-closed-verified the request genuinely came from Daily — this
 * module never re-checks signature/timestamp, and never assumes it either;
 * it is simply not reachable from the route handler without that gate
 * passing first (see src/app/api/webhooks/daily/route.ts).
 *
 * Subscribed events (see the Daily webhook configured for this project):
 * participant.joined ONLY (VIDEO-1B §8 — "subscribe only to the minimum
 * event(s) required"). Any other "type" is rejected, not silently ignored
 * — in normal operation Daily should never send one, since nothing else was
 * subscribed; receiving one anyway is either a misconfiguration or a
 * forged-but-somehow-signed request, and either way this is not something
 * to guess about.
 */

export class MalformedDailyWebhookPayloadError extends Error {}
export class UnsupportedDailyWebhookEventError extends Error {}

const SUPPORTED_EVENT_TYPES = new Set(["participant.joined"]);

interface ParticipantJoinedPayload {
  room: string;
  user_id: string;
}

function parseParticipantJoinedEvent(rawEvent: unknown): ParticipantJoinedPayload {
  if (typeof rawEvent !== "object" || rawEvent === null) {
    throw new MalformedDailyWebhookPayloadError("Event body is not an object");
  }
  const type = (rawEvent as Record<string, unknown>).type;
  if (typeof type !== "string") {
    throw new MalformedDailyWebhookPayloadError('Missing or non-string "type" field');
  }
  if (!SUPPORTED_EVENT_TYPES.has(type)) {
    throw new UnsupportedDailyWebhookEventError(`Unsupported event type: ${type}`);
  }

  const payload = (rawEvent as Record<string, unknown>).payload;
  if (typeof payload !== "object" || payload === null) {
    throw new MalformedDailyWebhookPayloadError('Missing or non-object "payload" field');
  }
  const room = (payload as Record<string, unknown>).room;
  const userId = (payload as Record<string, unknown>).user_id;
  if (typeof room !== "string" || room.length === 0) {
    throw new MalformedDailyWebhookPayloadError('Missing or invalid "payload.room" field');
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new MalformedDailyWebhookPayloadError('Missing or invalid "payload.user_id" field');
  }
  return { room, user_id: userId };
}

export interface ProcessDailyWebhookEventResult {
  handled: boolean;
  reason?: "unknown_room" | "unknown_participant";
}

/**
 * Server-authoritative correlation (VIDEO-1B §10) — a valid, signed
 * participant.joined event is proof Daily saw SOMEONE join a room it
 * manages; it is NOT, on its own, proof of who that is or that they are
 * entitled to attendance credit. `payload.user_id` is exactly the value
 * this codebase set as `user_id` when issuing that participant's meeting
 * token (see dailyVideoProvider.ts's createParticipantToken,
 * participantExternalId -> user_id) — a FutureTutor User.id, not something
 * Daily invents. This function:
 *   1. Resolves providerRoomId -> a Session_/Booking FutureTutor actually
 *      provisioned (unknown room -> safely ignored, never throws: a stale
 *      or foreign room name must not be a usable probe).
 *   2. Resolves user_id -> a real FutureTutor User (unknown -> ignored).
 *   3. Delegates to confirmVideoParticipantJoined, which independently
 *      RE-DERIVES this user's authorization for this booking from scratch
 *      (resolveVideoJoinAuthority) — this function's own room/user lookups
 *      are correlation, not authorization; confirmVideoParticipantJoined
 *      is what actually decides STUDENT/TUTOR/OBSERVER/DENIED and is the
 *      sole place attendance is ever written.
 * A GUARDIAN_OBSERVER's join event correlates and reaches step 3 exactly
 * like anyone else's, but confirmVideoParticipantJoined itself returns null
 * for OBSERVER without writing anything — dual-presence attendance is
 * unaffected, unchanged from VIDEO-1A.
 */
/**
 * TEMPORARY — VIDEO-1B correlation diagnostic. Logs a single, atomic,
 * pre-serialized JSON line (never an object passed as a separate console.log
 * arg — see dailyWebhookSignature.ts's own doc comment for why that
 * fragments under Railway's log pipeline) whenever processDailyWebhookEvent
 * cannot correlate an otherwise validly-signed participant.joined event to a
 * known Session_/User. Never logs the complete participant id, a token, a
 * signature, a secret, or any other payload/header field — only the room
 * name (a synthetic identifier, not a credential) and a shape summary of the
 * participant id (presence/length/first 6 chars). To be removed once root
 * cause is confirmed.
 */
function logCorrelationDiagnostic(reason: "unknown_room" | "unknown_participant", room: string, actorUserId: string) {
  console.log(
    "VIDEO-1B CORRELATION DIAGNOSTIC " +
      JSON.stringify({
        reason,
        room,
        participantIdShape: {
          present: actorUserId.length > 0,
          length: actorUserId.length > 0 ? actorUserId.length : null,
          prefix: actorUserId.length > 0 ? actorUserId.slice(0, 6) : null,
        },
      })
  );
}

export async function processDailyWebhookEvent(rawEvent: unknown): Promise<ProcessDailyWebhookEventResult> {
  const { room: providerRoomId, user_id: actorUserId } = parseParticipantJoinedEvent(rawEvent);

  const session = await db.session_.findFirst({
    where: { providerRoomId },
    select: { id: true, booking: { select: { id: true } } },
  });
  if (!session) {
    logCorrelationDiagnostic("unknown_room", providerRoomId, actorUserId);
    return { handled: false, reason: "unknown_room" };
  }

  const user = await db.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } });
  if (!user) {
    logCorrelationDiagnostic("unknown_participant", providerRoomId, actorUserId);
    return { handled: false, reason: "unknown_participant" };
  }

  const checkInResult = await confirmVideoParticipantJoined(session.booking.id, user.id, user.role);

  await writeAuditLog({
    actorUserId: null,
    action: "video_session.daily_webhook_participant_joined",
    entityType: "Session_",
    entityId: session.id,
    metadata: { providerRoomId, participantUserId: user.id, attendanceRecorded: checkInResult !== null },
  });

  return { handled: true };
}
