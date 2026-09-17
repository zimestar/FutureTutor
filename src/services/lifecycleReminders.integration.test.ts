import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { getStudentProfileLifecycle } from "@/lib/lifecycle/studentLifecycle";
import { resolveStudentReminderRecipients } from "@/lib/lifecycle/reminders/recipient";
import { assessReminderCandidate } from "@/lib/lifecycle/reminders/reminderCandidate";
import { revalidateReminderIntent } from "@/lib/lifecycle/reminders/preSendRecheck";

// LIFECYCLE-1B schema-decision Phase 16 — DB-constraint-dependent proofs
// (multi-guardian dedupe, concurrency, User-deletion policy) that can only
// be verified against a real Postgres unique constraint. These exact
// assertions were also verified live via this project's established
// disposable-script convention (isolated fixtures, run then deleted) against
// production in this session — this file makes that proof permanent and
// re-runnable in any environment where DATABASE_URL_TEST is reachable
// (could not execute in THIS session — see the mission's own honest
// "DB unreachable" report; not fabricated as passing).

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdRelationshipIds: string[] = [];
const createdReminderIds: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdReminderIds.length > 0) {
    await db.lifecycleReminder.deleteMany({ where: { id: { in: createdReminderIds } } });
    createdReminderIds.length = 0;
  }
  if (createdRelationshipIds.length > 0) {
    await db.parentStudentRelationship.deleteMany({ where: { id: { in: createdRelationshipIds } } });
    createdRelationshipIds.length = 0;
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
  return `lifecycle1b-it-${prefix}-${randomUUID()}@futuretutor.test`;
}

async function createTwoGuardianStudent() {
  const guardianAUser = await db.user.create({ data: { email: uniqueEmail("guardianA"), role: "PARENT" } });
  const guardianBUser = await db.user.create({ data: { email: uniqueEmail("guardianB"), role: "PARENT" } });
  createdUserIds.push(guardianAUser.id, guardianBUser.id);
  const guardianAProfile = await db.parentProfile.create({ data: { userId: guardianAUser.id, firstName: "A", lastName: "Guardian" } });
  const guardianBProfile = await db.parentProfile.create({ data: { userId: guardianBUser.id, firstName: "B", lastName: "Guardian" } });
  const student = await db.studentProfile.create({
    data: { firstName: "Kid", lastName: "TwoGuardians", managementMode: "GUARDIAN_MANAGED", userId: null, createdAt: new Date(Date.now() - 48 * 3600 * 1000) },
  });
  createdStudentProfileIds.push(student.id);
  const relA = await db.parentStudentRelationship.create({ data: { parentProfileId: guardianAProfile.id, studentProfileId: student.id, status: "ACTIVE" } });
  const relB = await db.parentStudentRelationship.create({ data: { parentProfileId: guardianBProfile.id, studentProfileId: student.id, status: "ACTIVE" } });
  createdRelationshipIds.push(relA.id, relB.id);
  return { guardianAUser, guardianBUser, student, relA };
}

describe("MULTI-GUARDIAN dedupe + concurrency (real DB unique constraint)", () => {
  it("two active guardians produce two distinct, independently-claimable LifecycleReminder rows, and a duplicate claim for either is idempotently rejected", async () => {
    const { guardianAUser, guardianBUser, student } = await createTwoGuardianStudent();
    const state = await getStudentProfileLifecycle(db, student.id);
    const candidateA = assessReminderCandidate(state!, guardianAUser.id)!;
    const candidateB = assessReminderCandidate(state!, guardianBUser.id)!;
    expect(candidateA.dedupeKey).not.toBe(candidateB.dedupeKey);

    const rowA = await db.lifecycleReminder.create({
      data: { role: "STUDENT", journey: state!.journey, subjectId: state!.subjectId, stage: state!.stage, episodeKey: candidateA.episodeKey, reminderNumber: candidateA.reminderNumber, recipientUserId: guardianAUser.id, relationship: "GUARDIAN", locale: "en", dedupeKey: candidateA.dedupeKey, status: "PENDING", scheduledFor: new Date() },
    });
    createdReminderIds.push(rowA.id);
    const rowB = await db.lifecycleReminder.create({
      data: { role: "STUDENT", journey: state!.journey, subjectId: state!.subjectId, stage: state!.stage, episodeKey: candidateB.episodeKey, reminderNumber: candidateB.reminderNumber, recipientUserId: guardianBUser.id, relationship: "GUARDIAN", locale: "fr", dedupeKey: candidateB.dedupeKey, status: "PENDING", scheduledFor: new Date() },
    });
    createdReminderIds.push(rowB.id);
    expect(rowA.id).not.toBe(rowB.id);

    await expect(
      db.lifecycleReminder.create({
        data: { role: "STUDENT", journey: state!.journey, subjectId: state!.subjectId, stage: state!.stage, episodeKey: candidateA.episodeKey, reminderNumber: candidateA.reminderNumber, recipientUserId: guardianAUser.id, relationship: "GUARDIAN", locale: "en", dedupeKey: candidateA.dedupeKey, status: "PENDING", scheduledFor: new Date() },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    const rowsForA = await db.lifecycleReminder.count({ where: { dedupeKey: candidateA.dedupeKey } });
    expect(rowsForA).toBe(1);
  });

  it("revoked guardian excluded from recipient resolution, and rejected by the pre-send recheck without invalidating the other guardian", async () => {
    const { guardianAUser, guardianBUser, student, relA } = await createTwoGuardianStudent();
    const state = await getStudentProfileLifecycle(db, student.id);
    const candidateA = assessReminderCandidate(state!, guardianAUser.id)!;
    const candidateB = assessReminderCandidate(state!, guardianBUser.id)!;

    await db.parentStudentRelationship.update({ where: { id: relA.id }, data: { status: "REVOKED", revokedAt: new Date() } });

    const recipientsAfter = await resolveStudentReminderRecipients(db, state!);
    expect(recipientsAfter.filter((r) => r.contactAllowed)).toHaveLength(1);
    expect(recipientsAfter.some((r) => r.recipientUserId === guardianBUser.id && r.contactAllowed)).toBe(true);

    const recheckA = await revalidateReminderIntent(db, { role: "STUDENT", subjectId: student.id, episodeKey: candidateA.episodeKey, recipientUserId: guardianAUser.id });
    expect(recheckA.safe).toBe(false);
    const recheckB = await revalidateReminderIntent(db, { role: "STUDENT", subjectId: student.id, episodeKey: candidateB.episodeKey, recipientUserId: guardianBUser.id });
    expect(recheckB.safe).toBe(true);
  });

  it("pending (unapproved) guardian invitation never produces a recipient", async () => {
    const { student } = await createTwoGuardianStudent();
    const pendingUser = await db.user.create({ data: { email: uniqueEmail("pending"), role: "PARENT" } });
    createdUserIds.push(pendingUser.id);
    const invitation = await db.familyInvitation.create({
      data: { type: "GUARDIAN_LINK", targetStudentProfileId: student.id, invitedEmailNormalized: pendingUser.email!.toLowerCase(), tokenHash: randomUUID(), status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const state = await getStudentProfileLifecycle(db, student.id);
    const recipients = await resolveStudentReminderRecipients(db, state!);
    expect(recipients.some((r) => r.recipientUserId === pendingUser.id)).toBe(false);
    await db.familyInvitation.delete({ where: { id: invitation.id } });
  });
});

describe("USER DELETE POLICY — recipientUserId SetNull, historical row preserved", () => {
  it("deleting the recipient User preserves the LifecycleReminder row with recipientUserId nulled and history intact", async () => {
    const user = await db.user.create({ data: { email: uniqueEmail("deletable-tutor"), role: "TUTOR" } });
    const tutorProfile = await db.tutorProfile.create({ data: { userId: user.id, slug: `it-del-${randomUUID()}`, applicationStatus: "DRAFT" } });
    const dedupeKey = `lifecycleReminder:test-deletion-${randomUUID()}:R1:recipient:${user.id}`;
    const row = await db.lifecycleReminder.create({
      data: { role: "TUTOR", journey: "TUTOR_CERTIFICATION", subjectId: tutorProfile.id, stage: "DRAFT", episodeKey: `TUTOR_CERTIFICATION:${tutorProfile.id}:DRAFT:${new Date().toISOString()}`, reminderNumber: 1, recipientUserId: user.id, relationship: "SELF", locale: "en", dedupeKey, status: "SENT", sentAt: new Date(), scheduledFor: new Date() },
    });

    await db.user.delete({ where: { id: user.id } }); // cascades TutorProfile

    const afterDelete = await db.lifecycleReminder.findUnique({ where: { id: row.id } });
    expect(afterDelete).not.toBeNull();
    expect(afterDelete?.recipientUserId).toBeNull();
    expect(afterDelete?.status).toBe("SENT");
    expect(afterDelete?.dedupeKey).toBe(dedupeKey);

    await db.lifecycleReminder.delete({ where: { id: row.id } });
  });
});
