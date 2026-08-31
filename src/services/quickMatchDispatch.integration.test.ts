import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// PROD-DISPATCHFIX1 — permanent regression coverage for the Quick Match
// dispatch batch-progression defect: advanceDispatch's parallel-round branch
// (src/services/quickMatchDispatch.ts) previously gated entry on
// `attemptsSoFar === settings.sequentialInvitationCount` — an EXACT equality
// check that can only ever be true once. Once the first (and only) parallel
// batch was dispatched, attemptsSoFar moved past that single value forever,
// so every later call fell through to the `else` branch and closed the
// request to NO_TUTOR_FOUND — regardless of how much headroom remained under
// maxDispatchAttempts. The DEV/DEMO defaults (sequential=2, parallel=3,
// max=5) never exposed this because 2+3 happens to equal 5 exactly, so the
// single batch always exhausted the whole budget by coincidence.
//
// The fix (see quickMatchDispatch.ts) changes that condition to `>=`, so the
// branch re-fires on every subsequent call as long as attemptsSoFar hasn't
// yet reached maxDispatchAttempts — turning "one parallel batch, maybe" into
// "as many parallel batches as fit under the budget," fully generically, for
// any valid TutorRankingSettings combination, not just the specific numbers
// below.
//
// Same DB-target-redirection technique as bookingCreationConcurrency.
// integration.test.ts / cancellationConcurrency.integration.test.ts (see
// those files' header comments for the full rationale): resolve and verify
// the test database FIRST, reassign process.env.DATABASE_URL to the
// verified target, THEN dynamically import every module that transitively
// touches @/lib/db's ambient singleton.

let advanceDispatch: typeof import("./quickMatchDispatch").advanceDispatch;
let expireStaleInvitationsAndAdvance: typeof import("./quickMatchDispatch").expireStaleInvitationsAndAdvance;
let createCustomerPriceQuote: typeof import("./customerPricing").createCustomerPriceQuote;

let db: PrismaClient;
let subjectId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutoringRequestIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // always NORMAL urgency band

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ advanceDispatch, expireStaleInvitationsAndAdvance } = await import("./quickMatchDispatch"));
  ({ createCustomerPriceQuote } = await import("./customerPricing"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run any dispatch-progression test.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton's current_database() ("${ambientDatabaseName}") equals the real development database name. Refusing to run any dispatch-progression test.`
    );
  }

  const subject = await db.subject.create({ data: { slug: `dispatchfix-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;

  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });

  await db.customerBasePriceRule.create({
    data: { subjectId, academicLevelId: null, baseDurationMinutes: 60, basePriceCents: 8000, pricingVersion: "CUSTOMER_PRICING_V1" },
  });
  await db.tutorBasePayoutRule.create({
    data: { tutorTier: "NEW", subjectId, academicLevelId: null, baseDurationMinutes: 60, payoutCents: 5000, payoutVersion: "TUTOR_PAYOUT_V1" },
  });
}, 30000);

afterAll(async () => {
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdTutoringRequestIds.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: createdTutoringRequestIds } } });
    const invitationIds = (
      await db.tutorInvitation.findMany({ where: { tutoringRequestId: { in: createdTutoringRequestIds } }, select: { id: true } })
    ).map((i) => i.id);
    if (invitationIds.length > 0) {
      await db.auditLog.deleteMany({ where: { entityId: { in: invitationIds } } });
      await db.tutorInvitation.deleteMany({ where: { id: { in: invitationIds } } });
    }
    await db.tutoringRequest.deleteMany({ where: { id: { in: createdTutoringRequestIds } } });
    createdTutoringRequestIds.length = 0;
  }
  if (createdCustomerQuoteIds.length > 0) {
    // TutorPayoutQuote rows are created internally by advanceDispatch (via
    // createTutorPayoutQuoteWithTx) — clean them up by their parent quote.
    await db.tutorPayoutQuote.deleteMany({ where: { customerPriceQuoteId: { in: createdCustomerQuoteIds } } });
    await db.customerPriceQuote.deleteMany({ where: { id: { in: createdCustomerQuoteIds } } });
    createdCustomerQuoteIds.length = 0;
  }
  if (createdTutorProfileIds.length > 0) {
    await db.tutorProfile.deleteMany({ where: { id: { in: createdTutorProfileIds } } });
    createdTutorProfileIds.length = 0;
  }
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
    createdStudentProfileIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `dispatchfix-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTutorUser(index: number) {
  const user = await db.user.create({ data: { email: uniqueEmail(`tutor-${index}`), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `dispatchfix-tutor-${index}-${randomUUID()}`,
      applicationStatus: "APPROVED",
      payoutTier: "NEW",
      learningMode: "BOTH",
      tutorAgreementAcceptedAt: new Date(),
      tutorAgreementAcceptedVersion: "2026-08-30",
      tutorAgreementAcceptedLocale: "en",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  await db.tutorSubject.create({ data: { tutorProfileId: tutorProfile.id, subjectId } });
  await db.tutorAvailability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tutorProfileId: tutorProfile.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "UTC",
      mode: "BOTH" as const,
    })),
  });
  return { user, tutorProfile };
}

async function createManyTutors(count: number) {
  const tutors = [];
  for (let i = 0; i < count; i++) tutors.push(await createTutorUser(i));
  return tutors;
}

async function createSelfManagedStudent() {
  const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Dispatch", lastName: "Student", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

async function createMatchingRequest() {
  const student = await createSelfManagedStudent();
  const quote = await createCustomerPriceQuote(
    {
      createdByUserId: student.user.id,
      studentProfileId: student.studentProfile.id,
      subjectId,
      academicLevelId: null,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt: FAR_FUTURE_START,
    },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  const request = await db.tutoringRequest.create({
    data: {
      createdByUserId: student.user.id,
      studentProfileId: student.studentProfile.id,
      subjectId,
      academicLevelId: null,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt: FAR_FUTURE_START,
      currency: "CAD",
      customerPriceQuoteId: quote.id,
      status: "MATCHING",
      dispatchRound: 0,
    },
  });
  createdTutoringRequestIds.push(request.id);
  return { student, quote, request };
}

/** True singleton, same insert-or-update pattern already established
 * throughout this program's disposable bootstrap scripts — safe here since
 * this only ever touches the isolated, verified TEST database. */
async function setRankingSettings(overrides: {
  sequentialInvitationCount: number;
  parallelBatchSize: number;
  maxDispatchAttempts: number;
  responseWindowMinutes?: number;
}) {
  const existing = await db.tutorRankingSettings.findFirst();
  const data = {
    sequentialInvitationCount: overrides.sequentialInvitationCount,
    parallelBatchSize: overrides.parallelBatchSize,
    maxDispatchAttempts: overrides.maxDispatchAttempts,
    responseWindowMinutes: overrides.responseWindowMinutes ?? 10,
  };
  if (existing) return db.tutorRankingSettings.update({ where: { id: existing.id }, data });
  return db.tutorRankingSettings.create({ data });
}

/** Simulates every currently-PENDING candidate declining — the trigger
 * advanceDispatch's own `pendingCount > 0 -> return` guard requires before
 * it will advance to the next round. */
async function declineAllPending(tutoringRequestId: string) {
  await db.tutorInvitation.updateMany({
    where: { tutoringRequestId, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
}

/**
 * Drives advanceDispatch through every round until the request leaves
 * MATCHING, declining every PENDING invitation between rounds (each call to
 * advanceDispatch performs exactly one round — one sequential invitation, or
 * one parallel batch). Returns the exact per-round batch sizes (only rounds
 * that actually created ≥1 new invitation) plus the final total and status.
 */
async function driveDispatchToCompletion(tutoringRequestId: string, maxRounds = 20) {
  const roundSizes: number[] = [];
  let previousTotal = 0;
  let finalStatus = "MATCHING";
  for (let round = 0; round < maxRounds; round++) {
    await advanceDispatch(tutoringRequestId);
    const totalInvitations = await db.tutorInvitation.count({ where: { tutoringRequestId } });
    const delta = totalInvitations - previousTotal;
    if (delta > 0) roundSizes.push(delta);
    previousTotal = totalInvitations;
    const request = await db.tutoringRequest.findUniqueOrThrow({ where: { id: tutoringRequestId } });
    finalStatus = request.status;
    if (request.status !== "MATCHING") break;
    await declineAllPending(tutoringRequestId);
  }
  return { roundSizes, totalInvitations: previousTotal, finalStatus };
}

describe("PROD-DISPATCHFIX1 — Quick Match dispatch batch progression", () => {
  it("CASE 1: sequential=3, parallel=3, max=12 -> 1+1+1+3+3+3 = 12, then NO_TUTOR_FOUND", async () => {
    await setRankingSettings({ sequentialInvitationCount: 3, parallelBatchSize: 3, maxDispatchAttempts: 12 });
    await createManyTutors(12);
    const { request } = await createMatchingRequest();

    const { roundSizes, totalInvitations, finalStatus } = await driveDispatchToCompletion(request.id);

    expect(roundSizes).toEqual([1, 1, 1, 3, 3, 3]);
    expect(totalInvitations).toBe(12);
    expect(finalStatus).toBe("NO_TUTOR_FOUND");
  });

  it("CASE 2: sequential=3, parallel=3, max=11 -> 1+1+1+3+3+2 = 11, never exceeding max (CASE 10 combined)", async () => {
    await setRankingSettings({ sequentialInvitationCount: 3, parallelBatchSize: 3, maxDispatchAttempts: 11 });
    await createManyTutors(11);
    const { request } = await createMatchingRequest();

    const { roundSizes, totalInvitations, finalStatus } = await driveDispatchToCompletion(request.id);

    expect(roundSizes).toEqual([1, 1, 1, 3, 3, 2]); // final partial parallel batch of 2
    expect(totalInvitations).toBe(11);
    expect(totalInvitations).toBeLessThanOrEqual(11); // maxDispatchAttempts never exceeded
    expect(finalStatus).toBe("NO_TUTOR_FOUND");
  });

  it("CASE 3: sequential=2, parallel=3, max=5 -> 1+1+3 = 5 (matches the DEV/DEMO-shaped configuration exactly)", async () => {
    await setRankingSettings({ sequentialInvitationCount: 2, parallelBatchSize: 3, maxDispatchAttempts: 5 });
    await createManyTutors(5);
    const { request } = await createMatchingRequest();

    const { roundSizes, totalInvitations, finalStatus } = await driveDispatchToCompletion(request.id);

    expect(roundSizes).toEqual([1, 1, 3]);
    expect(totalInvitations).toBe(5);
    expect(finalStatus).toBe("NO_TUTOR_FOUND");
  });

  it("CASE 4: sequential=1, parallel=2, max=7 -> 1+2+2+2 = 7", async () => {
    await setRankingSettings({ sequentialInvitationCount: 1, parallelBatchSize: 2, maxDispatchAttempts: 7 });
    await createManyTutors(7);
    const { request } = await createMatchingRequest();

    const { roundSizes, totalInvitations, finalStatus } = await driveDispatchToCompletion(request.id);

    expect(roundSizes).toEqual([1, 2, 2, 2]);
    expect(totalInvitations).toBe(7);
    expect(finalStatus).toBe("NO_TUTOR_FOUND");
  });

  it("CASE 5: fewer eligible tutors than maxDispatchAttempts -> stops naturally, no duplication, no error", async () => {
    await setRankingSettings({ sequentialInvitationCount: 3, parallelBatchSize: 3, maxDispatchAttempts: 12 });
    await createManyTutors(5); // fewer than max=12
    const { request } = await createMatchingRequest();

    const { roundSizes, totalInvitations, finalStatus } = await driveDispatchToCompletion(request.id);

    // 3 sequential (1 each) + one partial parallel batch of the remaining 2
    // eligible tutors, then the NEXT call finds zero eligible candidates and
    // closes immediately (getEligibleTutors' own empty-list branch, not the
    // attemptsSoFar/maxDispatchAttempts branch at all) — never a duplicate,
    // never an unhandled error.
    expect(roundSizes).toEqual([1, 1, 1, 2]);
    expect(totalInvitations).toBe(5); // every created tutor invited exactly once
    expect(finalStatus).toBe("NO_TUTOR_FOUND");

    // No tutor received two invitations for the same request (the exact
    // "improperly re-invited" invariant, Part 2 item K) — the DB's own
    // @@unique([tutoringRequestId, tutorProfileId, dispatchRound]) plus
    // getEligibleTutors' alreadyInvitedTutorIds guard enforce this; verified
    // here directly rather than merely asserted from the schema.
    const invitations = await db.tutorInvitation.findMany({ where: { tutoringRequestId: request.id } });
    const distinctTutorIds = new Set(invitations.map((i) => i.tutorProfileId));
    expect(distinctTutorIds.size).toBe(invitations.length);
  });

  it("CASE 6: candidate rejection during the SEQUENTIAL phase -> progresses to a genuinely different tutor, never re-invites the decliner", async () => {
    await setRankingSettings({ sequentialInvitationCount: 3, parallelBatchSize: 3, maxDispatchAttempts: 12 });
    await createManyTutors(6);
    const { request } = await createMatchingRequest();

    await advanceDispatch(request.id); // round 1 (sequential, 1 invitation)
    const firstInvitation = await db.tutorInvitation.findFirstOrThrow({ where: { tutoringRequestId: request.id } });
    expect(firstInvitation.dispatchRound).toBe(1);

    await declineAllPending(request.id); // the one candidate rejects
    await advanceDispatch(request.id); // round 2 (still sequential, attemptsSoFar=1 < 3)

    const allInvitations = await db.tutorInvitation.findMany({ where: { tutoringRequestId: request.id }, orderBy: { dispatchRound: "asc" } });
    expect(allInvitations.length).toBe(2);
    expect(allInvitations[1].tutorProfileId).not.toBe(firstInvitation.tutorProfileId); // a genuinely different tutor
    expect(allInvitations[1].status).toBe("PENDING");
  });

  it("CASE 7: candidate TIMEOUT during the sequential phase (via the real lazy-expiry mechanism) -> progresses correctly", async () => {
    await setRankingSettings({ sequentialInvitationCount: 2, parallelBatchSize: 2, maxDispatchAttempts: 6 });
    await createManyTutors(6);
    const { request } = await createMatchingRequest();

    await advanceDispatch(request.id); // round 1 (sequential)
    const firstInvitation = await db.tutorInvitation.findFirstOrThrow({ where: { tutoringRequestId: request.id } });

    // Force real expiry (not a manual decline) — backdate expiresAt, then
    // drive the actual certified lazy-expiry-on-read function, exactly the
    // mechanism a stale invitation reaches in production (a read path, or
    // the cron liveness route).
    await db.tutorInvitation.update({ where: { id: firstInvitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expireStaleInvitationsAndAdvance();

    const expired = await db.tutorInvitation.findUniqueOrThrow({ where: { id: firstInvitation.id } });
    expect(expired.status).toBe("EXPIRED");

    const allInvitations = await db.tutorInvitation.findMany({ where: { tutoringRequestId: request.id } });
    expect(allInvitations.length).toBe(2); // expireStaleInvitationsAndAdvance itself triggered round 2
    expect(allInvitations.some((i) => i.status === "PENDING" && i.tutorProfileId !== firstInvitation.tutorProfileId)).toBe(true);
  });

  it("CASE 8 (the exact defect this phase fixes): a parallel batch fully declines/expires -> the NEXT parallel batch is correctly dispatched, not a premature NO_TUTOR_FOUND", async () => {
    await setRankingSettings({ sequentialInvitationCount: 3, parallelBatchSize: 3, maxDispatchAttempts: 12 });
    await createManyTutors(9); // enough for seq(3) + 2 full parallel batches
    const { request } = await createMatchingRequest();

    // Drive through the sequential phase (3 rounds) + the FIRST parallel
    // batch (attemptsSoFar 3 -> 6) — this is exactly the point at which the
    // original defect (`attemptsSoFar === sequentialInvitationCount`)
    // stopped working: attemptsSoFar is now 6, which never again equals 3.
    for (let i = 0; i < 4; i++) {
      await advanceDispatch(request.id);
      await declineAllPending(request.id);
    }
    const afterFirstParallelBatch = await db.tutorInvitation.count({ where: { tutoringRequestId: request.id } });
    expect(afterFirstParallelBatch).toBe(6); // 3 sequential + 3 (first parallel batch)

    const requestBeforeSecondBatch = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(requestBeforeSecondBatch.status).toBe("MATCHING"); // NOT already closed

    // The critical call: with the ORIGINAL defect, this would fall through
    // to the else-branch and close the request to NO_TUTOR_FOUND despite 6
    // of 12 approved attempts remaining. With the fix, this must dispatch a
    // genuine second parallel batch of 3.
    await advanceDispatch(request.id);

    const afterSecondCall = await db.tutorInvitation.count({ where: { tutoringRequestId: request.id } });
    expect(afterSecondCall).toBe(9); // the second parallel batch WAS dispatched
    const requestAfterSecondBatch = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(requestAfterSecondBatch.status).toBe("MATCHING"); // still open — not prematurely closed
  });

  it("CASE 9: acceptance within a parallel batch -> dispatch stops cleanly, no further invitation is ever created for this request", async () => {
    await setRankingSettings({ sequentialInvitationCount: 1, parallelBatchSize: 2, maxDispatchAttempts: 5 });
    await createManyTutors(5);
    const { request } = await createMatchingRequest();

    await advanceDispatch(request.id); // sequential round (1)
    await declineAllPending(request.id);
    await advanceDispatch(request.id); // first parallel round (2) -> attemptsSoFar now 3

    const pending = await db.tutorInvitation.findMany({ where: { tutoringRequestId: request.id, status: "PENDING" } });
    expect(pending.length).toBe(2);

    // Simulate ONE of the two parallel candidates winning acceptance — the
    // exact request-level state transition acceptTutorInvitationAction's
    // Step A performs (full booking-creation transaction semantics are
    // already exhaustively covered by bookingCreationConcurrency.
    // integration.test.ts; this test isolates the DISPATCH-specific safety
    // property — that advanceDispatch correctly refuses to do anything once
    // the request has left MATCHING).
    const winner = pending[0];
    await db.tutoringRequest.updateMany({ where: { id: request.id, status: "MATCHING" }, data: { status: "PAYMENT_PENDING" } });
    await db.tutorInvitation.update({ where: { id: winner.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });

    const totalBefore = await db.tutorInvitation.count({ where: { tutoringRequestId: request.id } });
    await advanceDispatch(request.id); // must be a complete no-op now
    const totalAfter = await db.tutorInvitation.count({ where: { tutoringRequestId: request.id } });

    expect(totalAfter).toBe(totalBefore); // zero new invitations — advanceDispatch's own status!=="MATCHING" guard fired
    const finalRequest = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(finalRequest.status).toBe("PAYMENT_PENDING"); // unchanged by the no-op advanceDispatch call
  });
});
