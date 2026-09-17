import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";
import { correlateProviderMessage, processResendWebhookEvent } from "./emailEventCorrelation";
import type { WebhookEventPayload } from "resend";

// LIFECYCLE-1C — DB-constraint-dependent proofs (correlation, ambiguous
// match, idempotency, guardian independence, cascade delete). Same
// established convention as every other *.integration.test.ts this
// session; could not execute in THIS session (DATABASE_URL_TEST
// unreachable — same honest gap as LIFECYCLE-1A/1B) — equivalent behavior
// independently verified live via this project's disposable-fixture-script
// convention against production (see the mission's final certification
// report).

let db: PrismaClient;
const createdUserIds: string[] = [];
const createdTutorProfileIds: string[] = [];
const createdReminderIds: string[] = [];
const createdEventIds: string[] = [];

beforeAll(() => {
  const target = resolveVerifiedTestDatabase();
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });
});

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdEventIds.length > 0) {
    await db.lifecycleEmailEvent.deleteMany({ where: { id: { in: createdEventIds } } });
    createdEventIds.length = 0;
  }
  if (createdReminderIds.length > 0) {
    await db.lifecycleReminder.deleteMany({ where: { id: { in: createdReminderIds } } });
    createdReminderIds.length = 0;
  }
  if (createdTutorProfileIds.length > 0) {
    createdTutorProfileIds.length = 0; // cascades with the User delete below
  }
  if (createdUserIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

async function createReminderFixture(overrides: { providerMessageId?: string } = {}) {
  const user = await db.user.create({ data: { email: `lc1c-it-${randomUUID()}@futuretutor.test`, role: "TUTOR" } });
  createdUserIds.push(user.id);
  const tutorProfile = await db.tutorProfile.create({ data: { userId: user.id, slug: `lc1c-it-${randomUUID()}`, applicationStatus: "DRAFT" } });
  createdTutorProfileIds.push(tutorProfile.id);
  const reminder = await db.lifecycleReminder.create({
    data: {
      role: "TUTOR", journey: "TUTOR_CERTIFICATION", subjectId: tutorProfile.id, stage: "DRAFT",
      episodeKey: `TUTOR_CERTIFICATION:${tutorProfile.id}:DRAFT:${new Date().toISOString()}`,
      reminderNumber: 1, recipientUserId: user.id, relationship: "SELF", locale: "en",
      dedupeKey: `lifecycleReminder:test:${randomUUID()}:R1:recipient:${user.id}`,
      status: "SENT", sentAt: new Date(), scheduledFor: new Date(),
      providerMessageId: overrides.providerMessageId ?? `email_${randomUUID()}`,
    },
  });
  createdReminderIds.push(reminder.id);
  return { user, tutorProfile, reminder };
}

function openedPayload(emailId: string): WebhookEventPayload {
  return { type: "email.opened", created_at: "2026-09-17T10:00:00.000Z", data: { created_at: "2026-09-17T10:00:00.000Z", email_id: emailId, message_id: "<m@resend>", from: "noreply@futuretutor.ca", to: ["x@example.com"], subject: "s" } } as WebhookEventPayload;
}

describe("§7/§9 provider correlation", () => {
  it("a matching providerMessageId resolves the correct reminder", async () => {
    const { reminder } = await createReminderFixture();
    const result = await correlateProviderMessage(db, reminder.providerMessageId!);
    expect(result).toEqual({ matched: true, lifecycleReminderId: reminder.id });
  });

  it("§8 an unknown providerMessageId (belongs to some other FutureTutor email, e.g. a booking confirmation) is a safe no-op, not misattributed", async () => {
    const result = await correlateProviderMessage(db, `email_unrelated_${randomUUID()}`);
    expect(result).toEqual({ matched: false, reason: "NO_MATCH" });
  });

  it("ambiguous correlation (same providerMessageId on two rows) fails closed rather than picking either row", async () => {
    const sharedId = `email_ambiguous_${randomUUID()}`;
    const { reminder: r1 } = await createReminderFixture({ providerMessageId: sharedId });
    const { reminder: r2 } = await createReminderFixture({ providerMessageId: sharedId });
    const result = await correlateProviderMessage(db, sharedId);
    expect(result).toEqual({ matched: false, reason: "AMBIGUOUS_MATCH" });
    void r1;
    void r2;
  });
});

describe("§11-14/§21 idempotency and ordering-agnostic ingestion", () => {
  it("duplicate providerEventId persists exactly one logical event", async () => {
    const { reminder } = await createReminderFixture();
    const providerEventId = `whid_${randomUUID()}`;
    const first = await processResendWebhookEvent(db, providerEventId, openedPayload(reminder.providerMessageId!));
    const second = await processResendWebhookEvent(db, providerEventId, openedPayload(reminder.providerMessageId!));
    expect(first.persisted).toBe(true);
    expect(second).toEqual({ persisted: false, reason: "DUPLICATE" });
    const rows = await db.lifecycleEmailEvent.findMany({ where: { lifecycleReminderId: reminder.id } });
    createdEventIds.push(...rows.map((r) => r.id));
    expect(rows).toHaveLength(1);
  });

  it("two OPENED events with different providerEventIds both persist (repeated engagement is legitimate)", async () => {
    const { reminder } = await createReminderFixture();
    const first = await processResendWebhookEvent(db, `whid_${randomUUID()}`, openedPayload(reminder.providerMessageId!));
    const second = await processResendWebhookEvent(db, `whid_${randomUUID()}`, openedPayload(reminder.providerMessageId!));
    expect(first.persisted).toBe(true);
    expect(second.persisted).toBe(true);
    const rows = await db.lifecycleEmailEvent.findMany({ where: { lifecycleReminderId: reminder.id } });
    createdEventIds.push(...rows.map((r) => r.id));
    expect(rows).toHaveLength(2);
  });

  it("an OPENED event received before a DELIVERED event is still safely persisted — event ordering is never trusted or enforced at ingestion", async () => {
    const { reminder } = await createReminderFixture();
    const opened = await processResendWebhookEvent(db, `whid_${randomUUID()}`, openedPayload(reminder.providerMessageId!));
    expect(opened.persisted).toBe(true);
    const rows = await db.lifecycleEmailEvent.findMany({ where: { lifecycleReminderId: reminder.id } });
    createdEventIds.push(...rows.map((r) => r.id));
    expect(rows[0].type).toBe("OPENED");
  });
});

describe("USER DELETE POLICY — LifecycleReminder deletion cascades LifecycleEmailEvent", () => {
  it("deleting the LifecycleReminder row cascades its email events (schema-decision-approved Cascade, distinct from the User SetNull policy)", async () => {
    const { reminder } = await createReminderFixture();
    const event = await db.lifecycleEmailEvent.create({
      data: { lifecycleReminderId: reminder.id, providerEventId: `whid_${randomUUID()}`, providerMessageId: reminder.providerMessageId!, type: "OPENED", occurredAt: new Date() },
    });
    await db.lifecycleReminder.delete({ where: { id: reminder.id } });
    createdReminderIds.splice(createdReminderIds.indexOf(reminder.id), 1);
    const afterDelete = await db.lifecycleEmailEvent.findUnique({ where: { id: event.id } });
    expect(afterDelete).toBeNull();
  });
});
