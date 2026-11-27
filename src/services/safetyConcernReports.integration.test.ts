import "@/test-support/useVerifiedTestDatabase"; // must precede @/lib/db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createSafetyConcernReport, updateSafetyConcernReport } from "./safetyConcernReports";

// SAFETY-REPORTS1 — real-database coverage: storage, who is alerted, that
// the reporter's description never leaves the report row, and the admin
// status workflow with its audit trail.

const RUN = randomUUID().slice(0, 8);
const userIds: string[] = [];
const reportIds: string[] = [];
const DESCRIPTION = `Private details ${RUN}: the student said something worrying during the session.`;

let reporterId = "";
let superAdminId = "";
let safetyAdminId = "";
let tutorReviewerId = "";

async function createUser(role: "SUPER_ADMIN" | "ADMIN" | "PARENT", deactivated = false) {
  const user = await db.user.create({
    data: { email: `safety-it-${RUN}-${randomUUID()}@futuretutor.test`, role, deactivatedAt: deactivated ? new Date() : null },
  });
  userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  reporterId = (await createUser("PARENT")).id;
  superAdminId = (await createUser("SUPER_ADMIN")).id;
  safetyAdminId = (await createUser("ADMIN")).id;
  tutorReviewerId = (await createUser("ADMIN")).id;
  await db.adminPermissionAssignment.createMany({
    data: [
      { userId: safetyAdminId, permission: "ADMIN_SAFETY_REPORTS", grantedById: superAdminId },
      { userId: tutorReviewerId, permission: "ADMIN_TUTORS_REVIEW", grantedById: superAdminId },
    ],
  });
});

afterAll(async () => {
  await db.adminAlertNotification.deleteMany({ where: { dedupeKey: { in: reportIds.map((id) => `safetyConcern:${id}`) } } });
  await db.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { dedupeKey: { in: reportIds.map((id) => `safety_concern:${id}:received`) } }] } });
  for (const id of reportIds) {
    await db.notification.deleteMany({ where: { dedupeKey: { startsWith: `admin_alert:safetyConcern:${id}:` } } });
  }
  await db.auditLog.deleteMany({ where: { entityId: { in: reportIds } } });
  await db.safetyConcernReport.deleteMany({ where: { id: { in: reportIds } } });
  await db.adminPermissionAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("createSafetyConcernReport", () => {
  it("stores the report, acknowledges the reporter and alerts only admins allowed to handle it", async () => {
    const result = await createSafetyConcernReport(reporterId, {
      category: "CHILD_SAFETY",
      immediateDanger: true,
      concerning: "Session of Monday",
      description: DESCRIPTION,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    reportIds.push(result.reportId);

    const report = await db.safetyConcernReport.findUniqueOrThrow({ where: { id: result.reportId } });
    expect(report).toMatchObject({ reporterRole: "PARENT", category: "CHILD_SAFETY", immediateDanger: true, status: "OPEN", description: DESCRIPTION });

    const ack = await db.notification.findFirst({ where: { userId: reporterId, type: "safety_concern.received" } });
    expect(ack).not.toBeNull();

    const alerts = await db.adminAlertNotification.findMany({ where: { dedupeKey: `safetyConcern:${result.reportId}` } });
    const recipients = alerts.map((alert) => alert.recipientUserId);
    expect(recipients).toContain(superAdminId);
    expect(recipients).toContain(safetyAdminId);
    expect(recipients).not.toContain(tutorReviewerId);
    for (const alert of alerts) {
      expect(alert.event).toBe("SAFETY_CONCERN_REPORTED");
      expect(JSON.stringify(alert.contextSnapshot)).not.toContain(RUN);
      expect(alert.contextSnapshot).toMatchObject({ category: "CHILD_SAFETY", immediateDanger: true, adminPath: `/admin/safety-reports/${result.reportId}` });
    }

    const inApp = await db.notification.findFirst({ where: { userId: safetyAdminId, type: "admin_alert.safety_concern_reported" } });
    expect(inApp?.title).toBe("URGENT safety concern reported");
    expect(JSON.stringify(inApp)).not.toContain(RUN);

    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: result.reportId, action: "safety_concern.reported" } });
    expect(JSON.stringify(audit.metadata)).not.toContain(RUN);
  });

  it("refuses an empty or too short description without storing anything", async () => {
    const before = await db.safetyConcernReport.count({ where: { reporterUserId: reporterId } });
    const result = await createSafetyConcernReport(reporterId, { category: "OTHER", immediateDanger: false, description: "too short" });
    expect(result).toEqual({ ok: false, reason: "VALIDATION" });
    expect(await db.safetyConcernReport.count({ where: { reporterUserId: reporterId } })).toBe(before);
  });

  it("refuses a deactivated account", async () => {
    const inactive = await createUser("PARENT", true);
    const result = await createSafetyConcernReport(inactive.id, { category: "OTHER", immediateDanger: false, description: DESCRIPTION });
    expect(result).toEqual({ ok: false, reason: "ACCOUNT_INACTIVE" });
  });
});

describe("updateSafetyConcernReport", () => {
  it("records who resolved the report and audits every status change", async () => {
    const created = await createSafetyConcernReport(reporterId, { category: "HARASSMENT_OR_THREAT", immediateDanger: false, description: DESCRIPTION });
    if (!created.ok) throw new Error("report not created");
    reportIds.push(created.reportId);

    expect(await updateSafetyConcernReport(safetyAdminId, created.reportId, { status: "UNDER_REVIEW" })).toEqual({ ok: true });
    expect(await updateSafetyConcernReport(safetyAdminId, created.reportId, { status: "RESOLVED", resolutionNote: "Family contacted." })).toEqual({ ok: true });

    const report = await db.safetyConcernReport.findUniqueOrThrow({ where: { id: created.reportId } });
    expect(report).toMatchObject({ status: "RESOLVED", resolvedByUserId: safetyAdminId, resolutionNote: "Family contacted." });
    expect(report.resolvedAt).not.toBeNull();

    const changes = await db.auditLog.findMany({ where: { entityId: created.reportId, action: "safety_concern.status_changed" }, orderBy: { createdAt: "asc" } });
    expect(changes.map((row) => row.metadata)).toEqual([
      { from: "OPEN", to: "UNDER_REVIEW" },
      { from: "UNDER_REVIEW", to: "RESOLVED" },
    ]);

    expect(await updateSafetyConcernReport(safetyAdminId, created.reportId, { status: "BOGUS" })).toEqual({ ok: false, reason: "VALIDATION" });
    expect(await updateSafetyConcernReport(safetyAdminId, "missing-id", { status: "OPEN" })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
