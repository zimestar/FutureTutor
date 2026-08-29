import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveVerifiedTestDatabase } from "@/test-support/testDatabaseSafety";

// BETA-OPS1 — permanent DB-integration coverage for admin Student/Parent
// suspension (src/services/accountSuspension.ts, reusing User.deactivatedAt)
// and for the closed studentAuthorization.ts gap (a suspended actor loses
// financial/management authority — see studentAuthorization.test.ts for the
// pure-function matrix; this file proves the real DB-backed
// resolveStudentCapabilities wiring end-to-end) and the Postgres-backed rate
// limiter (src/lib/rateLimit.ts). Same dynamic-import-after-DATABASE_URL-
// redirect pattern as tutorAgreementAcceptance.integration.test.ts.

let suspendStudentAccount: typeof import("./accountSuspension").suspendStudentAccount;
let reactivateStudentAccount: typeof import("./accountSuspension").reactivateStudentAccount;
let suspendParentAccount: typeof import("./accountSuspension").suspendParentAccount;
let reactivateParentAccount: typeof import("./accountSuspension").reactivateParentAccount;
let resolveStudentCapabilities: typeof import("./studentAuthorization").resolveStudentCapabilities;
let checkRateLimit: typeof import("@/lib/rateLimit").checkRateLimit;
let checkActionRateLimit: typeof import("@/lib/rateLimit").checkActionRateLimit;

let db: PrismaClient;

const createdUserIds: string[] = [];
const createdStudentProfileIds: string[] = [];
const createdParentProfileIds: string[] = [];

beforeAll(async () => {
  const target = resolveVerifiedTestDatabase();
  const devDatabaseUrlForSafetyCheckOnly = process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: target.connectionString });
  db = new PrismaClient({ adapter });

  process.env.DATABASE_URL = target.connectionString;

  ({ suspendStudentAccount, reactivateStudentAccount, suspendParentAccount, reactivateParentAccount } = await import("./accountSuspension"));
  ({ resolveStudentCapabilities } = await import("./studentAuthorization"));
  ({ checkRateLimit, checkActionRateLimit } = await import("@/lib/rateLimit"));

  const { db: ambientDb } = await import("@/lib/db");
  const [{ current_database: ambientDatabaseName }] = await ambientDb.$queryRaw<
    Array<{ current_database: string }>
  >`SELECT current_database()`;
  if (ambientDatabaseName !== target.databaseName) {
    throw new Error(
      `FAIL CLOSED: ambient @/lib/db singleton reports current_database() = "${ambientDatabaseName}", but the verified test database is "${target.databaseName}". Refusing to run.`
    );
  }
  const devDatabaseNameForSafetyCheckOnly = devDatabaseUrlForSafetyCheckOnly
    ? new URL(devDatabaseUrlForSafetyCheckOnly).pathname.replace(/^\//, "")
    : null;
  if (devDatabaseNameForSafetyCheckOnly && ambientDatabaseName === devDatabaseNameForSafetyCheckOnly) {
    throw new Error(`FAIL CLOSED: ambient database equals the real development database name. Refusing to run.`);
  }
}, 30000);

afterAll(async () => {
  await db?.$disconnect();
});

afterEach(async () => {
  if (createdStudentProfileIds.length > 0) {
    await db.studentProfile.deleteMany({ where: { id: { in: createdStudentProfileIds } } });
  }
  if (createdParentProfileIds.length > 0) {
    await db.parentProfile.deleteMany({ where: { id: { in: createdParentProfileIds } } });
  }
  if (createdUserIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdStudentProfileIds.length = 0;
  createdParentProfileIds.length = 0;
  createdUserIds.length = 0;
});

async function createSelfManagedStudent() {
  const user = await db.user.create({ data: { email: `student-${randomUUID()}@example.com`, role: "STUDENT" } });
  createdUserIds.push(user.id);
  const student = await db.studentProfile.create({
    data: { userId: user.id, firstName: "Test", lastName: "Student", managementMode: "SELF_MANAGED", tutoringMode: "ONLINE" },
  });
  createdStudentProfileIds.push(student.id);
  return { user, student };
}

async function createGuardianManagedStudentWithNoLogin() {
  const student = await db.studentProfile.create({
    data: { userId: null, firstName: "NoLogin", lastName: "Student", managementMode: "GUARDIAN_MANAGED", tutoringMode: "ONLINE" },
  });
  createdStudentProfileIds.push(student.id);
  return student;
}

async function createParent() {
  const user = await db.user.create({ data: { email: `parent-${randomUUID()}@example.com`, role: "PARENT" } });
  createdUserIds.push(user.id);
  const parent = await db.parentProfile.create({ data: { userId: user.id, firstName: "Test", lastName: "Parent" } });
  createdParentProfileIds.push(parent.id);
  return { user, parent };
}

async function createAdmin() {
  const admin = await db.user.create({ data: { email: `admin-${randomUUID()}@example.com`, role: "ADMIN" } });
  createdUserIds.push(admin.id);
  return admin;
}

describe("BETA-OPS1 — suspendStudentAccount / reactivateStudentAccount", () => {
  it("OPS-SUSP-01: suspends a self-managed student's login and writes an audit log entry", async () => {
    const { user, student } = await createSelfManagedStudent();
    const admin = await createAdmin();

    await suspendStudentAccount(student.id, admin.id, "policy violation");

    const reloaded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.deactivatedAt).not.toBeNull();

    const audit = await db.auditLog.findFirst({ where: { action: "student.suspended", entityId: student.id } });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(admin.id);
  });

  it("OPS-SUSP-02: reactivateStudentAccount clears deactivatedAt and writes its own audit entry", async () => {
    const { user, student } = await createSelfManagedStudent();
    const admin = await createAdmin();
    await suspendStudentAccount(student.id, admin.id, "reason");

    await reactivateStudentAccount(student.id, admin.id, "resolved");

    const reloaded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.deactivatedAt).toBeNull();
    const audit = await db.auditLog.findFirst({ where: { action: "student.reactivated", entityId: student.id } });
    expect(audit).not.toBeNull();
  });

  it("OPS-SUSP-03: suspending a StudentProfile with no linked login throws rather than silently no-op'ing", async () => {
    const student = await createGuardianManagedStudentWithNoLogin();
    const admin = await createAdmin();
    await expect(suspendStudentAccount(student.id, admin.id, "reason")).rejects.toThrow();
  });

  it("OPS-SUSP-04: suspending an already-suspended student throws (no silent double-write)", async () => {
    const { student } = await createSelfManagedStudent();
    const admin = await createAdmin();
    await suspendStudentAccount(student.id, admin.id, "first");
    await expect(suspendStudentAccount(student.id, admin.id, "second")).rejects.toThrow();
  });
});

describe("BETA-OPS1 — suspendParentAccount / reactivateParentAccount", () => {
  it("OPS-SUSP-05: suspends a guardian's login and writes an audit log entry", async () => {
    const { user, parent } = await createParent();
    const admin = await createAdmin();

    await suspendParentAccount(parent.id, admin.id, "reason");

    const reloaded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.deactivatedAt).not.toBeNull();
    const audit = await db.auditLog.findFirst({ where: { action: "parent.suspended", entityId: parent.id } });
    expect(audit).not.toBeNull();
  });

  it("OPS-SUSP-06: reactivateParentAccount clears deactivatedAt", async () => {
    const { user, parent } = await createParent();
    const admin = await createAdmin();
    await suspendParentAccount(parent.id, admin.id, "reason");

    await reactivateParentAccount(parent.id, admin.id, "resolved");

    const reloaded = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.deactivatedAt).toBeNull();
  });
});

describe("BETA-OPS1 — resolveStudentCapabilities honors a real suspended actor", () => {
  it("OPS-SUSP-07: a suspended self-managed student loses canInitiatePaidBooking via the real DB-backed path", async () => {
    const { user, student } = await createSelfManagedStudent();
    const admin = await createAdmin();
    await suspendStudentAccount(student.id, admin.id, "reason");

    const capabilities = await resolveStudentCapabilities(db, user.id, student.id);
    expect(capabilities.canInitiatePaidBooking).toBe(false);
    expect(capabilities.canActForStudent).toBe(true);
  });

  it("OPS-SUSP-08: reactivating restores canInitiatePaidBooking", async () => {
    const { user, student } = await createSelfManagedStudent();
    const admin = await createAdmin();
    await suspendStudentAccount(student.id, admin.id, "reason");
    await reactivateStudentAccount(student.id, admin.id, "resolved");

    const capabilities = await resolveStudentCapabilities(db, user.id, student.id);
    expect(capabilities.canInitiatePaidBooking).toBe(true);
  });
});

describe("BETA-OPS1 — checkRateLimit (Postgres-backed fixed window)", () => {
  it("OPS-RATE-01: allows attempts up to the configured max, then blocks", async () => {
    const key = `test:unit:${randomUUID()}`;
    const config = { windowMs: 60_000, max: 3 };
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await checkRateLimit(key, config));
    }
    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results.slice(3).every((r) => !r.allowed)).toBe(true);
  });

  it("OPS-RATE-02: two different keys are tracked independently", async () => {
    const keyA = `test:unit:${randomUUID()}`;
    const keyB = `test:unit:${randomUUID()}`;
    const config = { windowMs: 60_000, max: 1 };
    expect((await checkRateLimit(keyA, config)).allowed).toBe(true);
    expect((await checkRateLimit(keyB, config)).allowed).toBe(true);
    expect((await checkRateLimit(keyA, config)).allowed).toBe(false);
  });
});

describe("BETA-OPS1 — checkActionRateLimit (identifier + IP composition)", () => {
  it("OPS-RATE-03: an exceeded identifier-scoped bucket blocks even when the IP bucket has room", async () => {
    const identifier = `user-${randomUUID()}@example.com`;
    const action = `test-action-${randomUUID()}`;
    const identifierLimit = { windowMs: 60_000, max: 1 };
    const ipLimit = { windowMs: 60_000, max: 100 };
    await checkActionRateLimit({ action, identifier, ip: "1.1.1.1", identifierLimit, ipLimit });
    const second = await checkActionRateLimit({ action, identifier, ip: "2.2.2.2", identifierLimit, ipLimit });
    expect(second.allowed).toBe(false);
  });

  it("OPS-RATE-04: an exceeded IP-scoped bucket blocks even for a fresh identifier", async () => {
    const action = `test-action-${randomUUID()}`;
    const ip = `9.9.9.${Math.floor(Math.random() * 255)}`;
    const identifierLimit = { windowMs: 60_000, max: 100 };
    const ipLimit = { windowMs: 60_000, max: 1 };
    await checkActionRateLimit({ action, identifier: "first@example.com", ip, identifierLimit, ipLimit });
    const second = await checkActionRateLimit({ action, identifier: "second@example.com", ip, identifierLimit, ipLimit });
    expect(second.allowed).toBe(false);
  });
});
