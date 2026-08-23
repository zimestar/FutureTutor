import "server-only";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { CHECK_IN_WINDOW_MS_BEFORE_START } from "@/services/sessionLifecycle";
import { VideoProviderUnavailableError, type VideoProviderAdapter } from "@/services/videoProvider";
import { writeAuditLog } from "@/lib/audit";

/**
 * VIDEO-1A — room provisioning. Rooms are created shortly before the
 * session (VIDEO-0's recommendation B), at the same instant the existing
 * check-in window opens (Booking.startAt - CHECK_IN_WINDOW_MS_BEFORE_START,
 * imported from sessionLifecycle.ts rather than redefined — one join
 * window, one constant).
 *
 * VIDEO_ACCESS_GRACE_MS_AFTER_END is a NEW, video-specific constant (not a
 * reuse of NO_SHOW_GRACE_PERIOD_MINUTES_AFTER_START, which measures from
 * Booking.startAt for a different purpose — see the VIDEO-0 report's
 * explicit reasoning for why these must stay separate, product-decided
 * constants rather than being conflated). Approved default: 10 minutes
 * after Booking.endAt.
 */
export const VIDEO_ACCESS_GRACE_MINUTES_AFTER_END = 10;
export const VIDEO_ACCESS_GRACE_MS_AFTER_END = VIDEO_ACCESS_GRACE_MINUTES_AFTER_END * 60 * 1000;

export class SessionNotFoundForVideoError extends Error {}

/** A unique-per-attempt sentinel written into the unique providerRoomId
 * column to atomically CLAIM the right to provision this Session_'s room,
 * before any provider network call is made. Only the caller whose guarded
 * updateMany actually matched a row (count === 1) may proceed to call the
 * provider and later overwrite the placeholder with the real providerRoomId
 * — this is what makes concurrent provisioning attempts for the SAME
 * Session_ produce at most one real provider room, without needing a
 * separate status column (Session_ already has no spare boolean for this,
 * and VIDEO-0/1A's own instruction is the smallest schema, not an
 * additional field). A losing/failed attempt leaves the real column NULL
 * (see the failure-path cleanup below), never stuck on the placeholder —
 * UNLESS the process is killed between the claim and that cleanup (a real
 * crash, not a caught JS error), which try/catch cannot protect against. To
 * recover from exactly that case without a new schema column, the
 * placeholder embeds its own claim timestamp (`pending:<epochMs>:<uuid>`),
 * checked below by isStalePlaceholder — a claim older than CLAIM_STALE_MS is
 * reclaimed via compare-and-swap on the sweep's next tick or the next
 * join-time provisioning attempt, whichever comes first. */
const CLAIM_PREFIX = "pending:";
const CLAIM_STALE_MS = 5 * 60 * 1000;

function isPlaceholder(value: string | null): boolean {
  return value !== null && value.startsWith(CLAIM_PREFIX);
}

function placeholderClaimedAt(value: string): Date | null {
  const epochMs = Number(value.slice(CLAIM_PREFIX.length).split(":")[0]);
  return Number.isFinite(epochMs) ? new Date(epochMs) : null;
}

function isStalePlaceholder(value: string, now: Date): boolean {
  const claimedAt = placeholderClaimedAt(value);
  if (!claimedAt) return true; // malformed/legacy placeholder — safe to reclaim
  return now.getTime() - claimedAt.getTime() > CLAIM_STALE_MS;
}

interface SessionForProvisioning {
  id: string;
  providerRoomId: string | null;
  booking: { id: string; startAt: Date; endAt: Date };
}

async function loadSessionForProvisioning(sessionId: string): Promise<SessionForProvisioning | null> {
  const session = await db.session_.findUnique({
    where: { id: sessionId },
    select: { id: true, providerRoomId: true, booking: { select: { id: true, startAt: true, endAt: true } } },
  });
  return session;
}

/**
 * Idempotent by construction (Step A/B/C, the same shape every other
 * external-provider call in this codebase uses — see stripeConnect.ts's
 * ensureConnectAccount and payments.ts's Step A/B/C doc comment):
 *  A. atomically claim the right to provision (guarded updateMany on
 *     providerRoomId: null, writing a unique placeholder)
 *  B. call the provider OUTSIDE any transaction
 *  C. converge: overwrite the placeholder with the real id on success, or
 *     clear it back to null on failure so a later retry (this function
 *     called again, e.g. by the next sweep tick) can claim again
 *
 * Returns the room reference once provisioned (whether by this call or an
 * earlier one) or null if provisioning was skipped because a concurrent
 * attempt currently holds the claim (the caller should simply try again
 * later — this is not an error).
 */
export async function ensureVideoRoomForSession(
  sessionId: string,
  provider: VideoProviderAdapter,
  options: { clock?: () => Date } = {}
): Promise<string | null> {
  const now = (options.clock ?? (() => new Date()))();
  const session = await loadSessionForProvisioning(sessionId);
  if (!session) throw new SessionNotFoundForVideoError();

  if (session.providerRoomId && !isPlaceholder(session.providerRoomId)) {
    return session.providerRoomId; // already provisioned — idempotent short-circuit
  }

  if (session.providerRoomId && isPlaceholder(session.providerRoomId)) {
    if (!isStalePlaceholder(session.providerRoomId, now)) {
      // A genuinely concurrent, still-in-flight attempt holds this claim —
      // nothing to do; try again later.
      return null;
    }
    // Stale claim — a prior attempt crashed between claiming and
    // converging/releasing (a real process kill, not a caught JS error).
    // Reclaim via compare-and-swap on the exact stale value so a second
    // concurrent reclaimer can't both succeed.
    const reclaimed = await db.session_.updateMany({
      where: { id: sessionId, providerRoomId: session.providerRoomId },
      data: { providerRoomId: null },
    });
    if (reclaimed.count === 0) {
      // Someone else already reclaimed/converged it first.
      return null;
    }
    await writeAuditLog({
      actorUserId: null,
      action: "video_session.stale_claim_reclaimed",
      entityType: "Session_",
      entityId: sessionId,
      metadata: { staleClaimToken: session.providerRoomId },
    });
  }

  const claimToken = `${CLAIM_PREFIX}${now.getTime()}:${randomUUID()}`;
  const claim = await db.session_.updateMany({
    where: { id: sessionId, providerRoomId: null },
    data: { providerRoomId: claimToken },
  });
  if (claim.count === 0) {
    // Either a concurrent attempt just won the claim (its own convergence
    // will finish shortly), or the room is already provisioned by the time
    // we got here — either way, this call has no further work to do.
    return null;
  }

  try {
    const room = await provider.createRoom({
      externalReference: session.id,
      notBefore: new Date(session.booking.startAt.getTime() - CHECK_IN_WINDOW_MS_BEFORE_START),
      expiresAt: new Date(session.booking.endAt.getTime() + VIDEO_ACCESS_GRACE_MS_AFTER_END),
    });

    // Only overwrite if we still hold OUR OWN claim token — defends against
    // a second writer reaching this point for the same session, which is
    // reachable (not merely theoretical) if this attempt's own provider call
    // ran long enough for its claim to be reclaimed as stale by a concurrent
    // sweep tick or join-time attempt (see CLAIM_STALE_MS above) before this
    // converge runs.
    const converge = await db.session_.updateMany({
      where: { id: sessionId, providerRoomId: claimToken },
      data: { videoProvider: provider.name, providerRoomId: room.providerRoomId, roomCreatedAt: new Date() },
    });
    if (converge.count === 0) {
      // Lost the row to something else between claim and converge (a stale
      // reclaim, per above, or — in the narrower case of a hard process
      // kill landing between the provider call returning and this converge
      // — nothing at all, until a later sweep/join-time attempt reclaims
      // the still-stuck placeholder and provisions a distinct new room).
      // Either way, THIS provider room is now unreferenced by FutureTutor:
      // no client was ever given its id (no token was issued against it, no
      // DB row points at it), so it cannot be joined and is not a
      // double-booking hazard. It is not actively reaped by any code this
      // phase (room names include a random suffix, not a deterministic key,
      // so a later attempt cannot rediscover/reuse it) — it is left to
      // Daily's own `properties.exp` deadline (the same booking-derived
      // expiry passed to createRoom above) to naturally stop being usable.
      // Accepted as a bounded, non-security residual limitation for VIDEO-1A;
      // deterministic room naming would close it fully and is a candidate
      // refinement for a later phase, not required for this one.
      return null;
    }

    await writeAuditLog({
      actorUserId: null,
      action: "video_session.room_provisioned",
      entityType: "Session_",
      entityId: sessionId,
      metadata: { provider: provider.name, bookingId: session.booking.id },
    });
    return room.providerRoomId;
  } catch (error) {
    // Release the claim so a later retry (next sweep tick, or a direct
    // join-time provisioning attempt) can try again — never leave the row
    // stuck on an unresolved placeholder.
    await db.session_.updateMany({
      where: { id: sessionId, providerRoomId: claimToken },
      data: { providerRoomId: null },
    });
    if (error instanceof VideoProviderUnavailableError) throw error;
    throw new VideoProviderUnavailableError(
      error instanceof Error ? error.message : "Unknown error during room provisioning"
    );
  }
}

export interface SweepDueVideoRoomProvisioningResult {
  attempted: number;
  provisioned: number;
  failed: number;
}

/**
 * Cron entry point — reuses /api/cron/session-noshow-tick, the existing
 * "session lifecycle time-boundary convergence" route, rather than a new
 * scheduling architecture (per VIDEO-1A's explicit instruction). Candidates:
 * a CONFIRMED, ONLINE-capable booking whose Session_ has no room yet and
 * whose join window has already opened, bounded above by the video access
 * grace deadline (no point provisioning for a booking nobody can join
 * anymore).
 */
export async function sweepDueVideoRoomProvisioning(
  provider: VideoProviderAdapter,
  limit = 100,
  options: { clock?: () => Date } = {}
): Promise<SweepDueVideoRoomProvisioningResult> {
  const now = (options.clock ?? (() => new Date()))();
  const candidates = await db.session_.findMany({
    where: {
      // Includes stale (and still-live, harmlessly re-skipped) placeholder
      // claims alongside untouched (null) rows, so a claim left behind by a
      // process that crashed between claiming and converging/releasing is
      // recovered here rather than being permanently invisible to every
      // future sweep tick — see the CLAIM_STALE_MS doc comment above.
      OR: [{ providerRoomId: null }, { providerRoomId: { startsWith: CLAIM_PREFIX } }],
      booking: {
        status: "CONFIRMED",
        mode: { in: ["ONLINE", "BOTH"] },
        startAt: { lte: new Date(now.getTime() + CHECK_IN_WINDOW_MS_BEFORE_START) },
        endAt: { gte: new Date(now.getTime() - VIDEO_ACCESS_GRACE_MS_AFTER_END) },
      },
    },
    select: { id: true },
    take: limit,
  });

  let provisioned = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const roomId = await ensureVideoRoomForSession(candidate.id, provider, { clock: () => now });
      if (roomId) provisioned++;
    } catch {
      failed++;
      // Per-item failure isolation — one Daily outage must never abort the
      // rest of the batch (mirrors runTier7RecentSuccessReverify's own
      // established per-candidate try/catch convention in tutorTransfers.ts).
    }
  }
  return { attempted: candidates.length, provisioned, failed };
}
