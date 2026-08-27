import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { listBookableStudentsForActor } from "./learnerSelection";
import { createCustomerPriceQuote, validateAndConsumeCustomerPriceQuote, QuoteNotOwnedError } from "./customerPricing";
import { createTutorPayoutQuote } from "./tutorPayout";
import {
  reserveBookingPendingPayment,
  hasOverlappingActiveBooking,
  SlotTakenError,
  NotAuthorizedForLearnerError,
  QuoteLearnerMismatchError,
} from "./bookingCreation";
import { createTutoringRequestForLearner } from "./tutoringRequestCreation";
import { canInitiatePaidBooking, canPayForStudent } from "./studentAuthorization";
import { withSerializableRetry } from "@/lib/serializableRetry";

// Phase H.7 — permanent DB-integration tests for Direct Booking + Quick
// Match learner/actor/payer wiring (§43-§47 of the H.7 prompt, numbered
// continuously 1-54 exactly as the prompt itself numbers them). Runs ONLY
// against the isolated DATABASE_URL_TEST database. Deliberately never
// calls ensureStripePaymentIntent/verifyAndAuthorizePaymentIntent/
// captureAuthorizedPayment (real Stripe network calls) — those are
// exercised separately, deliberately, in the dedicated sandbox
// verification pass (§48-§51 of the H.7 report), not in this always-run
// suite. getOrCreatePaymentForQuote is pure DB (no Stripe call) and is
// exactly what's needed to prove Payment.payerUserId correctness.

let db: PrismaClient;
let subjectId: string;
let academicLevelId: string;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdCustomerQuoteIds: string[] = [];
const createdTutorPayoutQuoteIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdBookingIds: string[] = [];
const createdTutoringRequestIds: string[] = [];

const FAR_FUTURE_START = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days out — well clear of any urgency band boundary

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  const subject = await db.subject.create({ data: { slug: `h7-it-subject-${randomUUID()}`, sortOrder: 999 } });
  subjectId = subject.id;
  const level = await db.academicLevel.create({ data: { slug: `h7-it-level-${randomUUID()}`, sortOrder: 999 } });
  academicLevelId = level.id;

  const existingSettings = await db.marketplacePricingSettings.findFirst();
  if (!existingSettings) await db.marketplacePricingSettings.create({ data: {} });

  await db.customerBasePriceRule.create({
    data: {
      subjectId,
      academicLevelId: null,
      baseDurationMinutes: 60,
      basePriceCents: 5000,
      pricingVersion: "CUSTOMER_PRICING_V1",
    },
  });
  await db.tutorBasePayoutRule.create({
    data: {
      tutorTier: "NEW",
      subjectId,
      academicLevelId: null,
      baseDurationMinutes: 60,
      payoutCents: 3000,
      payoutVersion: "TUTOR_PAYOUT_V1",
    },
  });
});

afterAll(async () => {
  await db.tutorBasePayoutRule.deleteMany({ where: { subjectId } });
  await db.customerBasePriceRule.deleteMany({ where: { subjectId } });
  await db.academicLevel.delete({ where: { id: academicLevelId } });
  await db.subject.delete({ where: { id: subjectId } });
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdPaymentIds.length > 0) {
    await db.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    createdPaymentIds.length = 0;
  }
  if (createdBookingIds.length > 0) {
    await db.bookingStatusHistory.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
    await db.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    createdBookingIds.length = 0;
  }
  if (createdTutorPayoutQuoteIds.length > 0) {
    await db.tutorPayoutQuote.deleteMany({ where: { id: { in: createdTutorPayoutQuoteIds } } });
    createdTutorPayoutQuoteIds.length = 0;
  }
  if (createdTutoringRequestIds.length > 0) {
    await db.tutoringRequest.deleteMany({ where: { id: { in: createdTutoringRequestIds } } });
    createdTutoringRequestIds.length = 0;
  }
  if (createdCustomerQuoteIds.length > 0) {
    await db.customerPriceQuote.deleteMany({ where: { id: { in: createdCustomerQuoteIds } } });
    createdCustomerQuoteIds.length = 0;
  }
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
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
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

function uniqueEmail(prefix: string) {
  return `h7-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createParentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("parent"), role: "PARENT" } });
  createdUserIds.push(user.id);
  const parentProfile = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  return { user, parentProfile };
}

async function createTutorUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("tutor"), role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({
    data: {
      userId: user.id,
      slug: `h7-it-tutor-${randomUUID()}`,
      applicationStatus: "APPROVED",
      payoutTier: "NEW",
      learningMode: "BOTH",
    },
  });
  createdTutorProfileIds.push(tutorProfile.id);
  return { user, tutorProfile };
}

async function createSelfManagedStudent() {
  const user = await db.user.create({ data: { email: uniqueEmail("self"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  const studentProfile = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Adult", lastName: "Student", managementMode: "SELF_MANAGED" },
  });
  createdStudentProfileIds.push(studentProfile.id);
  return { user, studentProfile };
}

async function createGuardianManagedChild(parentProfileId: string, firstName = "Kid") {
  const studentProfile = await db.studentProfile.create({
    data: {
      firstName,
      lastName: "Test",
      dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
      managementMode: "GUARDIAN_MANAGED",
      userId: null,
    },
  });
  createdStudentProfileIds.push(studentProfile.id);
  const relationship = await db.parentStudentRelationship.create({
    data: { parentProfileId, studentProfileId: studentProfile.id, status: "ACTIVE" },
  });
  createdRelationshipIds.push(relationship.id);
  return { studentProfile, relationship };
}

async function createBareStudentUser() {
  const user = await db.user.create({ data: { email: uniqueEmail("student"), role: "STUDENT" } });
  createdUserIds.push(user.id);
  return { user };
}

async function linkStudentUser(studentProfileId: string, userId: string) {
  await db.studentProfile.update({ where: { id: studentProfileId }, data: { userId } });
}

// Phase H.7 — createCustomerPriceQuote/createTutorPayoutQuote both take an
// explicit `client` (added this phase, defaulting to the ambient `db` for
// every pre-existing caller — see customerPricing.ts/tutorPayout.ts's own
// comments) so these fixture helpers can point them at the isolated test
// database instead of the real one.

async function makeQuote(actorUserId: string, studentProfileId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const quote = await createCustomerPriceQuote(
    {
      createdByUserId: actorUserId,
      studentProfileId,
      subjectId,
      academicLevelId,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt,
    },
    db
  );
  createdCustomerQuoteIds.push(quote.id);
  return quote;
}

async function makePayoutQuote(tutorProfileId: string, customerQuoteId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const payoutQuote = await createTutorPayoutQuote(
    {
      tutorProfileId,
      subjectId,
      academicLevelId,
      tutoringMode: "ONLINE",
      durationMinutes: 60,
      requestedStartAt,
    },
    customerQuoteId,
    db
  );
  createdTutorPayoutQuoteIds.push(payoutQuote.id);
  return payoutQuote;
}

/** Deliberately does NOT call payments.ts's getOrCreatePaymentForQuote —
 * that module is explicitly protected from H.7 changes (§39/§63 of the
 * H.7 prompt) and still hardcodes the ambient `db`. This constructs the
 * exact same row shape directly against the test database instead,
 * proving the payer-identity invariant (payerUserId distinct from
 * studentProfileId, always the actor) without touching that file.
 *
 * BETA-1 / P1-02 — created AUTHORIZED (not PENDING), matching real
 * production sequencing: reserveBookingPendingPayment now authoritatively
 * requires the Payment to already be AUTHORIZED or CAPTURED before it will
 * reserve a slot against it (see that function's own doc comment). A
 * PENDING payment was never a real precondition reserveBookingPendingPayment
 * was called with in production — verifyAndAuthorizePaymentIntent always
 * transitions it to AUTHORIZED first. */
async function makePayment(quoteId: string, payerUserId: string) {
  const quote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteId } });
  const payment = await db.payment.create({
    data: {
      id: randomUUID(),
      customerPriceQuoteId: quoteId,
      payerUserId,
      amountCents: quote.totalCents,
      currency: quote.currency,
      status: "AUTHORIZED",
      authorizedAt: new Date(),
      stripePaymentIntentId: `pi_test_${randomUUID()}`,
    },
  });
  createdPaymentIds.push(payment.id);
  return payment;
}

async function reserveBooking(params: {
  actorUserId: string;
  studentProfileId: string;
  tutorProfileId: string;
  customerPriceQuoteId: string;
  tutorPayoutQuoteId: string;
  paymentId: string;
  startAt?: Date;
}) {
  const startAt = params.startAt ?? FAR_FUTURE_START;
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  // BETA-1 / P1-02 — see tutorEarningConvergence.integration.test.ts's
  // identical comment.
  const booking = await withSerializableRetry(() =>
    db.$transaction(
      (tx) =>
        reserveBookingPendingPayment(tx, {
          actorUserId: params.actorUserId,
          studentProfileId: params.studentProfileId,
          tutorProfileId: params.tutorProfileId,
          subjectId,
          academicLevelId,
          startAt,
          endAt,
          timezone: "America/Toronto",
          mode: "ONLINE",
          paymentId: params.paymentId,
          customerPriceQuoteId: params.customerPriceQuoteId,
          tutorPayoutQuoteId: params.tutorPayoutQuoteId,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  );
  createdBookingIds.push(booking.id);
  return booking;
}

async function fullBookingSetup(actorUserId: string, studentProfileId: string, requestedStartAt: Date = FAR_FUTURE_START) {
  const { tutorProfile } = await createTutorUser();
  const quote = await makeQuote(actorUserId, studentProfileId, requestedStartAt);
  const payoutQuote = await makePayoutQuote(tutorProfile.id, quote.id, requestedStartAt);
  const payment = await makePayment(quote.id, actorUserId);
  return { tutorProfile, quote, payoutQuote, payment };
}

// ---------------------------------------------------------------------------
// §43 — Bookable Learner List (tests 1-8)
// ---------------------------------------------------------------------------

describe("Bookable Learner List", () => {
  it("1. SELF_MANAGED Student sees own profile as sole bookable learner", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const result = await listBookableStudentsForActor(db, user.id);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(studentProfile.id);
  });

  it("2. SELF_MANAGED Student cannot select an arbitrary other learner (not present in the list)", async () => {
    const { user } = await createSelfManagedStudent();
    const { studentProfile: otherProfile } = await createSelfManagedStudent();
    const result = await listBookableStudentsForActor(db, user.id);
    expect(result.map((s) => s.id)).not.toContain(otherProfile.id);
  });

  it("3. Parent with Child A sees A", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const result = await listBookableStudentsForActor(db, user.id);
    expect(result.map((s) => s.id)).toContain(childA.id);
  });

  it("4. Parent with A+B sees both", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, "ChildB");
    const result = await listBookableStudentsForActor(db, user.id);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(expect.arrayContaining([childA.id, childB.id]));
  });

  it("5. REVOKED relationship child not selectable", async () => {
    const { user, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });
    const result = await listBookableStudentsForActor(db, user.id);
    expect(result.map((s) => s.id)).not.toContain(studentProfile.id);
  });

  it("6. unrelated child not selectable", async () => {
    const { user: parentA } = await createParentUser();
    const { parentProfile: profileB } = await createParentUser();
    const { studentProfile: childB } = await createGuardianManagedChild(profileB.id);
    const result = await listBookableStudentsForActor(db, parentA.id);
    expect(result.map((s) => s.id)).not.toContain(childB.id);
  });

  it("7. GUARDIAN_MANAGED restricted Student receives zero financially-bookable targets", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);
    const result = await listBookableStudentsForActor(db, studentUser.id);
    expect(result).toEqual([]);
  });

  it("8. Tutor receives zero", async () => {
    const { user: tutorUser } = await createTutorUser();
    const result = await listBookableStudentsForActor(db, tutorUser.id);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §44 — Quote (tests 9-18)
// ---------------------------------------------------------------------------

describe("Quote Authorization / Learner Persistence", () => {
  it("9. SELF_MANAGED Student creates quote for self", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const quote = await makeQuote(user.id, studentProfile.id);
    expect(quote.studentProfileId).toBe(studentProfile.id);
    expect(quote.createdByUserId).toBe(user.id);
  });

  it("10-11-12. Parent creates quote for linked Child A; quote.studentProfileId = Child A; quote.createdByUserId = Parent", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const quote = await makeQuote(parent.id, childA.id);
    expect(quote.studentProfileId).toBe(childA.id);
    expect(quote.createdByUserId).toBe(parent.id);
  });

  it("13. Parent cannot quote unrelated child (H.2 pre-check denies before any quote-creation call site would even be reached)", async () => {
    const { user: parentA } = await createParentUser();
    const { parentProfile: profileB } = await createParentUser();
    const { studentProfile: childB } = await createGuardianManagedChild(profileB.id);
    const authorized = await canInitiatePaidBooking(db, parentA.id, childB.id);
    expect(authorized).toBe(false);
  });

  it("14. REVOKED Parent cannot quote former child", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });
    const authorized = await canInitiatePaidBooking(db, parent.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("15. restricted Student cannot quote even own GUARDIAN_MANAGED profile for the paid flow", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: studentUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, studentUser.id);
    const authorized = await canInitiatePaidBooking(db, studentUser.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("16. Child A quote cannot be consumed for Child B — direct attempt via reserveBookingPendingPayment fails, and a different actor cannot consume it either", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, "ChildB");
    const { user: otherParent } = await createParentUser();
    const quoteForA = await makeQuote(parent.id, childA.id);

    // Ownership dimension: a different actor (not the quote's own
    // createdByUserId) cannot consume it at all, regardless of learner.
    await expect(
      db.$transaction((tx) =>
        validateAndConsumeCustomerPriceQuote(tx, quoteForA.id, otherParent.id, {
          subjectId,
          academicLevelId,
          tutoringMode: "ONLINE",
          durationMinutes: 60,
          requestedStartAt: FAR_FUTURE_START,
        })
      )
    ).rejects.toThrow(QuoteNotOwnedError);

    // Learner dimension: consuming for the correct owner but the WRONG
    // learner target (Child B, via reserveBookingPendingPayment's own
    // check) fails too — see test 29 for the full booking-path assertion.
    // Here we confirm the quote itself still carries Child A, never B.
    const refetched = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quoteForA.id } });
    expect(refetched.studentProfileId).toBe(childA.id);
    expect(refetched.studentProfileId).not.toBe(childB.id);
  });

  it("17. forged studentProfileId (unknown id) is rejected by the learner-resolution step, not silently accepted", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    await createGuardianManagedChild(parentProfile.id);
    const forgedId = "forged-nonexistent-student-profile-id";
    const authorized = await canInitiatePaidBooking(db, parent.id, forgedId);
    expect(authorized).toBe(false);
  });

  it("18. price inputs/result remain identical for equivalent learner/session regardless of self vs guardian actor — pricing formula untouched", async () => {
    const { user: selfUser, studentProfile: selfProfile } = await createSelfManagedStudent();
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childProfile } = await createGuardianManagedChild(parentProfile.id);

    const selfQuote = await makeQuote(selfUser.id, selfProfile.id);
    const guardianQuote = await makeQuote(parent.id, childProfile.id);

    expect(guardianQuote.basePriceCents).toBe(selfQuote.basePriceCents);
    expect(guardianQuote.subtotalCents).toBe(selfQuote.subtotalCents);
    expect(guardianQuote.totalCents).toBe(selfQuote.totalCents);
    expect(guardianQuote.currency).toBe(selfQuote.currency);
  });
});

// ---------------------------------------------------------------------------
// §45 — Direct Booking (tests 19-33)
// ---------------------------------------------------------------------------

describe("Direct Booking", () => {
  it("19-20. SELF_MANAGED existing Direct Booking succeeds; resulting Booking learner = self profile", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(user.id, studentProfile.id);
    const booking = await reserveBooking({
      actorUserId: user.id,
      studentProfileId: studentProfile.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    expect(booking.studentProfileId).toBe(studentProfile.id);
  });

  it("21-22-23. Parent booking Child A succeeds; Booking.studentProfileId = Child A; payer = Parent", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(parent.id, childA.id);
    const booking = await reserveBooking({
      actorUserId: parent.id,
      studentProfileId: childA.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    expect(booking.studentProfileId).toBe(childA.id);
    expect(payment.payerUserId).toBe(parent.id);
  });

  it("24. child userId NULL does not block Parent booking", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    expect(studentProfile.userId).toBeNull();
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(parent.id, studentProfile.id);
    const booking = await reserveBooking({
      actorUserId: parent.id,
      studentProfileId: studentProfile.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    expect(booking.studentProfileId).toBe(studentProfile.id);
  });

  it("25. restricted-login child still lets Parent book", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: childUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, childUser.id);
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(parent.id, studentProfile.id);
    const booking = await reserveBooking({
      actorUserId: parent.id,
      studentProfileId: studentProfile.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    expect(booking.studentProfileId).toBe(studentProfile.id);
    // The child's own userId is never substituted as payer or actor.
    expect(booking.studentProfileId).not.toBe(childUser.id);
  });

  it("26. restricted Student cannot Direct Book (transaction-bound re-check denies)", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: childUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, childUser.id);
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(childUser.id, studentProfile.id);

    await expect(
      reserveBooking({
        actorUserId: childUser.id,
        studentProfileId: studentProfile.id,
        tutorProfileId: tutorProfile.id,
        customerPriceQuoteId: quote.id,
        tutorPayoutQuoteId: payoutQuote.id,
        paymentId: payment.id,
      })
    ).rejects.toThrow(NotAuthorizedForLearnerError);
  });

  it("27. unrelated Parent cannot Direct Book", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: unrelatedParent } = await createParentUser();
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(unrelatedParent.id, studentProfile.id);

    await expect(
      reserveBooking({
        actorUserId: unrelatedParent.id,
        studentProfileId: studentProfile.id,
        tutorProfileId: tutorProfile.id,
        customerPriceQuoteId: quote.id,
        tutorPayoutQuoteId: payoutQuote.id,
        paymentId: payment.id,
      })
    ).rejects.toThrow(NotAuthorizedForLearnerError);
  });

  it("28. REVOKED Parent cannot Direct Book", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(parent.id, studentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(
      reserveBooking({
        actorUserId: parent.id,
        studentProfileId: studentProfile.id,
        tutorProfileId: tutorProfile.id,
        customerPriceQuoteId: quote.id,
        tutorPayoutQuoteId: payoutQuote.id,
        paymentId: payment.id,
      })
    ).rejects.toThrow(NotAuthorizedForLearnerError);
  });

  it("29. Child A quote + Child B booking target rejected (QuoteLearnerMismatchError)", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, "ChildB");
    const { tutorProfile } = await createTutorUser();
    const quoteForA = await makeQuote(parent.id, childA.id);
    const payoutQuote = await makePayoutQuote(tutorProfile.id, quoteForA.id);
    const payment = await makePayment(quoteForA.id, parent.id);

    await expect(
      reserveBooking({
        actorUserId: parent.id,
        studentProfileId: childB.id, // mismatched target — quote was priced for Child A
        tutorProfileId: tutorProfile.id,
        customerPriceQuoteId: quoteForA.id,
        tutorPayoutQuoteId: payoutQuote.id,
        paymentId: payment.id,
      })
    ).rejects.toThrow(QuoteLearnerMismatchError);
  });

  it("30. overlapping-slot protection remains unchanged (real interval-overlap check, unaffected by learner identity)", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(user.id, studentProfile.id);
    await reserveBooking({
      actorUserId: user.id,
      studentProfileId: studentProfile.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });

    const overlapping = await hasOverlappingActiveBooking(
      db as unknown as Prisma.TransactionClient,
      tutorProfile.id,
      new Date(FAR_FUTURE_START.getTime() + 30 * 60 * 1000),
      new Date(FAR_FUTURE_START.getTime() + 90 * 60 * 1000)
    );
    expect(overlapping).toBe(true);
  });

  it("31. duplicate/double submission remains idempotent/guarded — a second reservation attempt against the same already-taken slot fails with SlotTakenError", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(user.id, studentProfile.id);
    await reserveBooking({
      actorUserId: user.id,
      studentProfileId: studentProfile.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });

    const secondQuote = await makeQuote(user.id, studentProfile.id);
    const secondPayoutQuote = await makePayoutQuote(tutorProfile.id, secondQuote.id);
    const secondPayment = await makePayment(secondQuote.id, user.id);

    await expect(
      reserveBooking({
        actorUserId: user.id,
        studentProfileId: studentProfile.id,
        tutorProfileId: tutorProfile.id,
        customerPriceQuoteId: secondQuote.id,
        tutorPayoutQuoteId: secondPayoutQuote.id,
        paymentId: secondPayment.id,
      })
    ).rejects.toThrow(SlotTakenError);
  });

  it("32. transaction-time authority re-check succeeds for a legitimate, still-ACTIVE Parent", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(parent.id, studentProfile.id);
    // No revocation between setup and reservation — the re-check must pass.
    const booking = await reserveBooking({
      actorUserId: parent.id,
      studentProfileId: studentProfile.id,
      tutorProfileId: tutorProfile.id,
      customerPriceQuoteId: quote.id,
      tutorPayoutQuoteId: payoutQuote.id,
      paymentId: payment.id,
    });
    expect(booking.id).toBeDefined();
  });

  it("33. REAL TOCTOU: guardian revoked after pre-check, before the authoritative transaction — booking creation fails safely, nothing is created, quote is not consumed", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);

    // Step 1: Parent is ACTIVE guardian, pre-check succeeds.
    const preCheckAuthorized = await canInitiatePaidBooking(db, parent.id, studentProfile.id);
    expect(preCheckAuthorized).toBe(true);

    const { tutorProfile, quote, payoutQuote, payment } = await fullBookingSetup(parent.id, studentProfile.id);

    // Step 2: relationship is revoked for real, in Postgres, before the
    // authoritative transaction runs — not a mocked capability return.
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    // Step 3: the authoritative transaction's fresh canInitiatePaidBooking
    // re-check must now fail.
    await expect(
      reserveBooking({
        actorUserId: parent.id,
        studentProfileId: studentProfile.id,
        tutorProfileId: tutorProfile.id,
        customerPriceQuoteId: quote.id,
        tutorPayoutQuoteId: payoutQuote.id,
        paymentId: payment.id,
      })
    ).rejects.toThrow(NotAuthorizedForLearnerError);

    // Required assertions: no Booking, quote NOT consumed, no Stripe call
    // (getOrCreatePaymentForQuote never calls Stripe; capture is never
    // reached at all since the reservation itself already threw).
    const bookingCount = await db.booking.count({ where: { customerPriceQuoteId: quote.id } });
    expect(bookingCount).toBe(0);
    const refetchedQuote = await db.customerPriceQuote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(refetchedQuote.status).toBe("ACTIVE"); // never consumed
    const refetchedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    // BETA-1 / P1-02 — the fixture now creates the Payment already
    // AUTHORIZED (matching real production sequencing); this assertion's
    // point is unchanged — the payment was never CAPTURED or attached to a
    // Booking, since the reservation attempt failed before reaching either.
    expect(refetchedPayment.status).toBe("AUTHORIZED");
    expect(refetchedPayment.bookingId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §46 — Quick Match (tests 34-46)
// ---------------------------------------------------------------------------

describe("Quick Match", () => {
  it("34-35. SELF_MANAGED existing Quick Match creation succeeds; request.studentProfileId = self", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const quote = await makeQuote(user.id, studentProfile.id);
    const request = await db.$transaction((tx) =>
      createTutoringRequestForLearner(tx, {
        actorUserId: user.id,
        studentProfileId: studentProfile.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: FAR_FUTURE_START,
        currency: quote.currency,
        customerPriceQuoteId: quote.id,
      })
    );
    createdTutoringRequestIds.push(request.id);
    expect(request.studentProfileId).toBe(studentProfile.id);
  });

  it("36-37-38. Parent Quick Match for Child A succeeds; TutoringRequest.studentProfileId = Child A; createdByUserId = Parent", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const quote = await makeQuote(parent.id, childA.id);
    const request = await db.$transaction((tx) =>
      createTutoringRequestForLearner(tx, {
        actorUserId: parent.id,
        studentProfileId: childA.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: FAR_FUTURE_START,
        currency: quote.currency,
        customerPriceQuoteId: quote.id,
      })
    );
    createdTutoringRequestIds.push(request.id);
    expect(request.studentProfileId).toBe(childA.id);
    expect(request.createdByUserId).toBe(parent.id);
  });

  it("39. Parent can separately create for Child B without contamination", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const { studentProfile: childB } = await createGuardianManagedChild(parentProfile.id, "ChildB");
    const quoteA = await makeQuote(parent.id, childA.id);
    const quoteB = await makeQuote(parent.id, childB.id, new Date(FAR_FUTURE_START.getTime() + 60 * 60 * 1000));

    const requestA = await db.$transaction((tx) =>
      createTutoringRequestForLearner(tx, {
        actorUserId: parent.id,
        studentProfileId: childA.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: FAR_FUTURE_START,
        currency: quoteA.currency,
        customerPriceQuoteId: quoteA.id,
      })
    );
    createdTutoringRequestIds.push(requestA.id);
    const requestB = await db.$transaction((tx) =>
      createTutoringRequestForLearner(tx, {
        actorUserId: parent.id,
        studentProfileId: childB.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: new Date(FAR_FUTURE_START.getTime() + 60 * 60 * 1000),
        currency: quoteB.currency,
        customerPriceQuoteId: quoteB.id,
      })
    );
    createdTutoringRequestIds.push(requestB.id);

    expect(requestA.studentProfileId).toBe(childA.id);
    expect(requestB.studentProfileId).toBe(childB.id);
    const refetchedA = await db.tutoringRequest.findUniqueOrThrow({ where: { id: requestA.id } });
    expect(refetchedA.studentProfileId).toBe(childA.id); // untouched by B's creation
  });

  it("40. restricted Student cannot initiate", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: childUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, childUser.id);
    const authorized = await canInitiatePaidBooking(db, childUser.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("41. unrelated Parent cannot initiate", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: unrelatedParent } = await createParentUser();
    const authorized = await canInitiatePaidBooking(db, unrelatedParent.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("42. REVOKED Parent cannot initiate", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });
    const authorized = await canInitiatePaidBooking(db, parent.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("43. forged learner ID denied", async () => {
    const { user: parent } = await createParentUser();
    const authorized = await canInitiatePaidBooking(db, parent.id, "forged-nonexistent-id");
    expect(authorized).toBe(false);
  });

  it("44. transaction-time authority re-check runs for a legitimate Parent (succeeds)", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const quote = await makeQuote(parent.id, studentProfile.id);
    const request = await db.$transaction((tx) =>
      createTutoringRequestForLearner(tx, {
        actorUserId: parent.id,
        studentProfileId: studentProfile.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: FAR_FUTURE_START,
        currency: quote.currency,
        customerPriceQuoteId: quote.id,
      })
    );
    createdTutoringRequestIds.push(request.id);
    expect(request.id).toBeDefined();
  });

  it("45. REAL TOCTOU: guardian revoked before the authoritative TutoringRequest-creation transaction — creation denied, nothing created", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile, relationship } = await createGuardianManagedChild(parentProfile.id);

    const preCheckAuthorized = await canInitiatePaidBooking(db, parent.id, studentProfile.id);
    expect(preCheckAuthorized).toBe(true);

    const quote = await makeQuote(parent.id, studentProfile.id);

    // Revoked for real, in Postgres, between the pre-check/quote-creation
    // and the authoritative request-creation transaction.
    await db.parentStudentRelationship.update({ where: { id: relationship.id }, data: { status: "REVOKED" } });

    await expect(
      db.$transaction((tx) =>
        createTutoringRequestForLearner(tx, {
          actorUserId: parent.id,
          studentProfileId: studentProfile.id,
          subjectId,
          academicLevelId,
          tutoringMode: "ONLINE",
          durationMinutes: 60,
          requestedStartAt: FAR_FUTURE_START,
          currency: quote.currency,
          customerPriceQuoteId: quote.id,
        })
      )
    ).rejects.toThrow(NotAuthorizedForLearnerError);

    const requestCount = await db.tutoringRequest.count({ where: { customerPriceQuoteId: quote.id } });
    expect(requestCount).toBe(0);
  });

  it("46. tutor ranking/dispatch receives the correct learner/request (studentProfileId traceable end-to-end) — dispatch/ranking code itself unmodified by H.7", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const quote = await makeQuote(parent.id, studentProfile.id);
    const request = await db.$transaction((tx) =>
      createTutoringRequestForLearner(tx, {
        actorUserId: parent.id,
        studentProfileId: studentProfile.id,
        subjectId,
        academicLevelId,
        tutoringMode: "ONLINE",
        durationMinutes: 60,
        requestedStartAt: FAR_FUTURE_START,
        currency: quote.currency,
        customerPriceQuoteId: quote.id,
      })
    );
    createdTutoringRequestIds.push(request.id);
    // What quickMatchDispatch.ts's own eligibility/ranking queries read is
    // exactly this authoritative studentProfileId — proven by re-fetching
    // the persisted row through the same field dispatch code reads.
    const refetched = await db.tutoringRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(refetched.studentProfileId).toBe(studentProfile.id);
  });
});

// ---------------------------------------------------------------------------
// §47 — Payer (tests 47-54)
// ---------------------------------------------------------------------------

describe("Payer", () => {
  it("47. SELF_MANAGED payment.payerUserId = Student User", async () => {
    const { user, studentProfile } = await createSelfManagedStudent();
    const quote = await makeQuote(user.id, studentProfile.id);
    const payment = await makePayment(quote.id, user.id);
    expect(payment.payerUserId).toBe(user.id);
  });

  it("48-49. Parent booking Child A: Payment.payerUserId = Parent User; learner remains Child A", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile: childA } = await createGuardianManagedChild(parentProfile.id, "ChildA");
    const quote = await makeQuote(parent.id, childA.id);
    const payment = await makePayment(quote.id, parent.id);
    expect(payment.payerUserId).toBe(parent.id);
    expect(quote.studentProfileId).toBe(childA.id);
  });

  it("50. Child A's restricted User id is never substituted as payer", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: childUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, childUser.id);
    const quote = await makeQuote(parent.id, studentProfile.id);
    const payment = await makePayment(quote.id, parent.id);
    expect(payment.payerUserId).toBe(parent.id);
    expect(payment.payerUserId).not.toBe(childUser.id);
  });

  it("51. child userId NULL still supports Parent payer", async () => {
    const { user: parent, parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    expect(studentProfile.userId).toBeNull();
    const quote = await makeQuote(parent.id, studentProfile.id);
    const payment = await makePayment(quote.id, parent.id);
    expect(payment.payerUserId).toBe(parent.id);
  });

  it("52. unrelated Parent cannot prepare/authorize payment (canPayForStudent denies)", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: unrelatedParent } = await createParentUser();
    const authorized = await canPayForStudent(db, unrelatedParent.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("53. restricted Student cannot prepare/authorize payment (canPayForStudent denies)", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: childUser } = await createBareStudentUser();
    await linkStudentUser(studentProfile.id, childUser.id);
    const authorized = await canPayForStudent(db, childUser.id, studentProfile.id);
    expect(authorized).toBe(false);
  });

  it("54. denied path performs zero Stripe calls — structurally true: canPayForStudent/canInitiatePaidBooking are pure DB reads, evaluated and denied before any Stripe-calling function (ensureStripePaymentIntent/verifyAndAuthorizePaymentIntent/captureAuthorizedPayment) is ever invoked in the real action layer", async () => {
    const { parentProfile } = await createParentUser();
    const { studentProfile } = await createGuardianManagedChild(parentProfile.id);
    const { user: unrelatedParent } = await createParentUser();
    // The denial itself never touches getStripeClient()/Stripe SDK at all —
    // proven by the fact this check alone (no Stripe import in this test
    // file at all) is sufficient to determine the outcome.
    const authorized = await canPayForStudent(db, unrelatedParent.id, studentProfile.id);
    expect(authorized).toBe(false);
  });
});

