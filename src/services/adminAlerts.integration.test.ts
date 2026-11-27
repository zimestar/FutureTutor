import "@/test-support/useVerifiedTestDatabase"; // must precede @/lib/db
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { SendTutorApplicationEmail } from "@/lib/email/resendSendTutorApplicationEmail";
import { dispatchAdminAlerts, emitAdminAlert, resolveTutorReviewAlertRecipients } from "./adminAlerts";
import { loadTutorPipeline } from "./tutorPipelineQueue";
import { runTutorPipelineDigest } from "./tutorPipelineDigest";

// TUTOR-PIPELINE1 — admin alerts and the applications board against a real
// PostgreSQL database: who receives alerts, outbox idempotency, delivery
// language, failure handling, the pipeline classification and the digest.
// The test database may hold other suites' admins, so assertions are about
// this file's own fixtures, never about exact global counts.

const RUN = randomUUID().slice(0, 8);
const BASE_URL = "https://futuretutor.test";
const userIds: string[] = [];
const tutorProfileIds: string[] = [];
const dedupeKeys: string[] = [];

let superAdminId = "";
let reviewerId = "";
let readOnlyAdminId = "";
let deactivatedAdminId = "";

async function createUser(data: { role: "SUPER_ADMIN" | "ADMIN" | "TUTOR"; locale?: string; deactivated?: boolean; name?: string }) {
  const user = await db.user.create({
    data: {
      email: `pipeline-it-${RUN}-${randomUUID()}@futuretutor.test`,
      name: data.name ?? null,
      role: data.role,
      preferredLocale: data.locale ?? null,
      deactivatedAt: data.deactivated ? new Date() : null,
    },
  });
  userIds.push(user.id);
  return user;
}

function uniqueKey(label: string) {
  const key = `pipeline-it:${RUN}:${label}:${randomUUID()}`;
  dedupeKeys.push(key);
  return key;
}

function recordingSender(fail = false) {
  const sent: Array<{ to: string; subject: string }> = [];
  const send: SendTutorApplicationEmail = async ({ to, subject }) => {
    if (fail) throw new Error("provider down");
    sent.push({ to, subject });
    return { providerMessageId: `msg-${randomUUID()}` };
  };
  return { sent, send };
}

beforeAll(async () => {
  superAdminId = (await createUser({ role: "SUPER_ADMIN", locale: "fr" })).id;
  reviewerId = (await createUser({ role: "ADMIN", locale: "en" })).id;
  readOnlyAdminId = (await createUser({ role: "ADMIN" })).id;
  deactivatedAdminId = (await createUser({ role: "SUPER_ADMIN", deactivated: true })).id;
  await db.adminPermissionAssignment.createMany({
    data: [
      { userId: reviewerId, permission: "ADMIN_TUTORS_REVIEW", grantedById: superAdminId },
      { userId: readOnlyAdminId, permission: "ADMIN_TUTORS_READ", grantedById: superAdminId },
    ],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.adminAlertNotification.deleteMany({
    where: { OR: [{ dedupeKey: { in: dedupeKeys } }, { tutorProfileId: { in: tutorProfileIds } }, { dedupeKey: { startsWith: "tutorPipelineDigest:2099-" } }] },
  });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.notification.deleteMany({ where: { dedupeKey: { startsWith: "admin_alert:pipeline-it:" } } });
  await db.notification.deleteMany({ where: { dedupeKey: { startsWith: "admin_alert:tutorPipelineDigest:2099-" } } });
  await db.tutorInterview.deleteMany({ where: { tutorProfileId: { in: tutorProfileIds } } });
  await db.tutorDocument.deleteMany({ where: { tutorProfileId: { in: tutorProfileIds } } });
  await db.tutorProfile.deleteMany({ where: { id: { in: tutorProfileIds } } });
  await db.adminPermissionAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("resolveTutorReviewAlertRecipients", () => {
  it("includes active super admins and reviewers, excludes read-only and deactivated admins", async () => {
    const recipients = await db.$transaction((tx) => resolveTutorReviewAlertRecipients(tx));
    const ids = recipients.map((recipient) => recipient.userId);
    expect(ids).toContain(superAdminId);
    expect(ids).toContain(reviewerId);
    expect(ids).not.toContain(readOnlyAdminId);
    expect(ids).not.toContain(deactivatedAdminId);
    expect(recipients.some((recipient) => recipient.recipientKey === "team")).toBe(false);
  });

  it("adds the team mailbox only when ADMIN_ALERTS_TEAM_EMAIL is set", async () => {
    vi.stubEnv("ADMIN_ALERTS_TEAM_EMAIL", "team@futuretutor.test");
    const recipients = await db.$transaction((tx) => resolveTutorReviewAlertRecipients(tx));
    expect(recipients.filter((recipient) => recipient.recipientKey === "team")).toEqual([{ recipientKey: "team", userId: null }]);
  });
});

describe("emitAdminAlert + dispatchAdminAlerts", () => {
  async function emit(dedupeKey: string) {
    await db.$transaction((tx) =>
      emitAdminAlert(tx, {
        event: "TUTOR_APPLICATION_SUBMITTED",
        dedupeKey,
        tutorProfileId: null,
        detail: { tutorName: "Ada Tutor", applicationStatus: "UNDER_REVIEW" },
        inAppTitle: "New tutor application",
        inAppBody: "Ada Tutor submitted an application.",
      })
    );
  }

  it("writes one outbox row and one in-app notification per recipient, even when emitted twice", async () => {
    const key = uniqueKey("idempotent");
    await emit(key);
    await emit(key);

    const rows = await db.adminAlertNotification.findMany({ where: { dedupeKey: key } });
    const ours = rows.filter((row) => row.recipientUserId === superAdminId || row.recipientUserId === reviewerId);
    expect(ours).toHaveLength(2);
    expect(new Set(rows.map((row) => row.recipientKey)).size).toBe(rows.length);

    const inApp = await db.notification.findMany({ where: { userId: { in: [superAdminId, reviewerId] }, dedupeKey: { startsWith: `admin_alert:${key}:` } } });
    expect(inApp).toHaveLength(2);
    expect(inApp.every((row) => row.type === "admin_alert.tutor_application_submitted")).toBe(true);
  });

  it("sends each alert once, in the recipient's own language", async () => {
    const key = uniqueKey("language");
    await emit(key);
    const ids = (await db.adminAlertNotification.findMany({ where: { dedupeKey: key }, select: { id: true } })).map((row) => row.id);

    const { sent, send } = recordingSender();
    await dispatchAdminAlerts({ ids, sendEmail: send, baseUrl: BASE_URL });
    await dispatchAdminAlerts({ ids, sendEmail: send, baseUrl: BASE_URL });

    const superAdmin = await db.user.findUniqueOrThrow({ where: { id: superAdminId } });
    const reviewer = await db.user.findUniqueOrThrow({ where: { id: reviewerId } });
    expect(sent.filter((mail) => mail.to === superAdmin.email)).toEqual([{ to: superAdmin.email, subject: "Nouvelle candidature de tuteur : Ada Tutor" }]);
    expect(sent.filter((mail) => mail.to === reviewer.email)).toEqual([{ to: reviewer.email, subject: "New tutor application: Ada Tutor" }]);

    const rows = await db.adminAlertNotification.findMany({ where: { id: { in: ids }, recipientUserId: { in: [superAdminId, reviewerId] } } });
    expect(rows.every((row) => row.status === "SENT" && row.providerMessageId)).toBe(true);
  });

  it("records a provider failure for a later retry instead of throwing", async () => {
    const key = uniqueKey("failure");
    await emit(key);
    const ids = (await db.adminAlertNotification.findMany({ where: { dedupeKey: key }, select: { id: true } })).map((row) => row.id);

    const { send } = recordingSender(true);
    await expect(dispatchAdminAlerts({ ids, sendEmail: send, baseUrl: BASE_URL })).resolves.toMatchObject({ sent: 0 });

    const row = await db.adminAlertNotification.findFirstOrThrow({ where: { dedupeKey: key, recipientUserId: superAdminId } });
    expect(row).toMatchObject({ status: "FAILED", attemptCount: 1, error: "provider down" });

    const { sent, send: retry } = recordingSender();
    await dispatchAdminAlerts({ ids: [row.id], sendEmail: retry, baseUrl: BASE_URL });
    expect(sent).toHaveLength(1);
    expect((await db.adminAlertNotification.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SENT");
  });

  it("does not email an admin deactivated after the alert was queued", async () => {
    const lateAdmin = await createUser({ role: "SUPER_ADMIN" });
    const key = uniqueKey("deactivated");
    await emit(key);
    await db.user.update({ where: { id: lateAdmin.id }, data: { deactivatedAt: new Date() } });
    const row = await db.adminAlertNotification.findFirstOrThrow({ where: { dedupeKey: key, recipientUserId: lateAdmin.id } });

    const { sent, send } = recordingSender();
    await dispatchAdminAlerts({ ids: [row.id], sendEmail: send, baseUrl: BASE_URL });

    expect(sent).toHaveLength(0);
    expect(await db.adminAlertNotification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: "FAILED",
      error: "Recipient no longer eligible",
    });
  });
});

describe("applications board and daily digest", () => {
  async function createApplication(status: "UNDER_REVIEW" | "TRAINING_REQUIRED", name: string) {
    const user = await createUser({ role: "TUTOR", name });
    const tutor = await db.tutorProfile.create({ data: { userId: user.id, slug: `pipeline-it-${randomUUID()}`, applicationStatus: status } });
    tutorProfileIds.push(tutor.id);
    return { user, tutor };
  }

  it("classifies applications from real data", async () => {
    const reviewing = await createApplication("UNDER_REVIEW", `Reviewing ${RUN}`);
    await db.tutorDocument.create({
      data: {
        tutorProfileId: reviewing.tutor.id,
        type: "DIPLOMA",
        storageKey: `${reviewing.user.id}/${randomUUID()}.pdf`,
        originalFileName: "diploma.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        status: "PENDING_REVIEW",
      },
    });
    const training = await createApplication("TRAINING_REQUIRED", `Training ${RUN}`);

    const pipeline = await loadTutorPipeline();
    expect(pipeline.find((entry) => entry.tutorProfileId === reviewing.tutor.id)).toMatchObject({ owner: "admin", nextAction: "reviewDocuments" });
    expect(pipeline.find((entry) => entry.tutorProfileId === training.tutor.id)).toMatchObject({ owner: "candidate", nextAction: "completeTraining" });
  });

  it("records one digest per day listing applications waiting on the team, and never on candidates", async () => {
    const waiting = await createApplication("UNDER_REVIEW", `Digest ${RUN}`);
    await db.tutorDocument.create({
      data: {
        tutorProfileId: waiting.tutor.id,
        type: "TRANSCRIPT",
        storageKey: `${waiting.user.id}/${randomUUID()}.pdf`,
        originalFileName: "transcript.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        status: "UPLOADED",
      },
    });
    await createApplication("TRAINING_REQUIRED", `Candidate side ${RUN}`);

    // A far-future "now": everything is old enough, and the day is unique to this run.
    const now = new Date(Date.UTC(2099, 0, 1 + Math.floor(Math.random() * 360)));
    const day = now.toISOString().slice(0, 10);
    const first = await runTutorPipelineDigest(now);
    const second = await runTutorPipelineDigest(now);
    expect(first.digestRecorded).toBe(true);
    expect(second.digestRecorded).toBe(true);

    const rows = await db.adminAlertNotification.findMany({ where: { dedupeKey: `tutorPipelineDigest:${day}`, recipientUserId: superAdminId } });
    expect(rows).toHaveLength(1);
    const items = (rows[0].contextSnapshot as { items: Array<{ tutorName: string; nextAction: string }> }).items;
    expect(items.find((item) => item.tutorName === `Digest ${RUN}`)).toMatchObject({ nextAction: "reviewDocuments" });
    expect(items.some((item) => item.tutorName === `Candidate side ${RUN}`)).toBe(false);
  });
});
