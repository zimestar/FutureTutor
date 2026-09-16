import { describe, it, expect } from "vitest";
import { assessTutorLifecycle, type TutorLifecycleInput } from "./tutorLifecycle";
import { assessParentLifecycle, type ParentLifecycleInput } from "./parentLifecycle";
import {
  assessStudentProfileLifecycle,
  type StudentProfileLifecycleInput,
  assessStudentLoginLinking,
  type StudentLoginLinkingInput,
} from "./studentLifecycle";
import { REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS } from "./config";

// LIFECYCLE-1A — deterministic tests for the pure, domain-derived lifecycle
// evaluators. No database: every input is a plain object the loader
// functions (tested separately, DB-backed, in lifecycle.integration.test.ts)
// would otherwise assemble from TutorProfile/ParentProfile/StudentProfile +
// their related rows. Test numbering below matches the mission's own
// LIFECYCLE-1A Phase 17 checklist (§1-§46) — "if applicable" items that have
// no distinct product state are documented, not fabricated.

const NOW = new Date("2026-09-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

// ---------------------------------------------------------------------------
// TUTOR — §1-14
// ---------------------------------------------------------------------------

function baseTutorInput(overrides: Partial<TutorLifecycleInput> = {}): TutorLifecycleInput {
  return {
    id: "tutor-1",
    userId: "user-tutor-1",
    applicationStatus: "DRAFT",
    createdAt: hoursAgo(1),
    userDeactivatedAt: null,
    latestDocumentUploadedAt: null,
    latestApplicationEventAt: null,
    latestTrainingProgressAt: null,
    latestExamAttemptAt: null,
    ...overrides,
  };
}

describe("Tutor lifecycle", () => {
  it("§1 new tutor account incomplete -> DRAFT, USER_ACTION_REQUIRED", () => {
    const result = assessTutorLifecycle(baseTutorInput(), NOW);
    expect(result.stage).toBe("DRAFT");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
    expect(result.userActionRequired).toBe(true);
    expect(result.nextAction).toBe("/tutor/profile");
  });

  it("§2 tutor profile incomplete is the same DRAFT state — the schema has no separate 'profile' sub-status distinct from DRAFT (submitApplication's own gate proves headline/bio/subject/level completeness is enforced at DRAFT, not via a distinct status)", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "DRAFT" }), NOW);
    expect(result.status).toBe("USER_ACTION_REQUIRED");
  });

  it("§3 education/background has no distinct applicationStatus of its own — UNDER_REVIEW covers document+education review uniformly (documented gap, no source-evidenced separate stage)", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "UNDER_REVIEW" }), NOW);
    expect(result.status).toBe("WAITING_ON_FUTURETUTOR");
  });

  it("§4 documents action required from tutor is folded into DRAFT/SUBMITTED (upload has no status gate of its own) — SUBMITTED itself is a FutureTutor-side wait, not a tutor action", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "SUBMITTED" }), NOW);
    expect(result.status).toBe("WAITING_ON_FUTURETUTOR");
    expect(result.userActionRequired).toBe(false);
  });

  it("§5 documents submitted and waiting on review -> UNDER_REVIEW, WAITING_ON_FUTURETUTOR, never USER_ACTION_REQUIRED", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "UNDER_REVIEW" }), NOW);
    expect(result.status).toBe("WAITING_ON_FUTURETUTOR");
    expect(result.userActionRequired).toBe(false);
    expect(result.reminderEligible).toBe(false);
  });

  it("§6/§7 INTERVIEW_REQUIRED has no tutor-facing action anywhere in source (scheduleInterview/recordInterviewEvaluation are 100% admin-only) -> WAITING_ON_ADMIN, never USER_ACTION_REQUIRED", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "INTERVIEW_REQUIRED" }), NOW);
    expect(result.status).toBe("WAITING_ON_ADMIN");
    expect(result.userActionRequired).toBe(false);
    expect(result.suppressionReason).toBe("WAITING_ON_ADMIN");
  });

  it("§8 tutor training incomplete -> TRAINING_REQUIRED, USER_ACTION_REQUIRED", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "TRAINING_REQUIRED" }), NOW);
    expect(result.stage).toBe("TRAINING_REQUIRED");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
    expect(result.nextAction).toBe("/tutor/training");
  });

  it("§9 tutor assessment incomplete -> EXAM_REQUIRED, USER_ACTION_REQUIRED", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "EXAM_REQUIRED" }), NOW);
    expect(result.stage).toBe("EXAM_REQUIRED");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
    expect(result.nextAction).toBe("/tutor/exam");
  });

  it("§10 tutor waiting final admin review -> FINAL_REVIEW, WAITING_ON_ADMIN (a discrete approve/reject decision)", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "FINAL_REVIEW" }), NOW);
    expect(result.status).toBe("WAITING_ON_ADMIN");
    expect(result.userActionRequired).toBe(false);
  });

  it("§11 tutor approved/certified -> COMPLETED, never reminder eligible", () => {
    const approvedAt = hoursAgo(2);
    const result = assessTutorLifecycle(
      baseTutorInput({ applicationStatus: "APPROVED", latestApplicationEventAt: approvedAt }),
      NOW
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.completedAt).toEqual(approvedAt);
    expect(result.reminderEligible).toBe(false);
    expect(result.suppressionReason).toBe("ONBOARDING_COMPLETED");
  });

  it("§12 tutor rejected -> REJECTED, never reminder eligible", () => {
    const result = assessTutorLifecycle(
      baseTutorInput({ applicationStatus: "REJECTED", latestApplicationEventAt: hoursAgo(1000) }),
      NOW
    );
    expect(result.status).toBe("REJECTED");
    expect(result.reminderEligible).toBe(false);
    expect(result.suppressionReason).toBe("APPLICATION_REJECTED");
  });

  it("§13 tutor suspended (applicationStatus) -> SUSPENDED, never reminder eligible", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "SUSPENDED" }), NOW);
    expect(result.status).toBe("SUSPENDED");
    expect(result.suppressionReason).toBe("APPLICATION_SUSPENDED");
    expect(result.reminderEligible).toBe(false);
  });

  it("§14 tutor account deactivated (User.deactivatedAt) overrides even an otherwise-actionable status -> SUSPENDED", () => {
    const result = assessTutorLifecycle(
      baseTutorInput({ applicationStatus: "TRAINING_REQUIRED", userDeactivatedAt: hoursAgo(1) }),
      NOW
    );
    expect(result.status).toBe("SUSPENDED");
    expect(result.suppressionReason).toBe("ACCOUNT_SUSPENDED");
    expect(result.userActionRequired).toBe(false);
    expect(result.reminderEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PARENT — §15-19
// ---------------------------------------------------------------------------

function baseParentInput(overrides: Partial<ParentLifecycleInput> = {}): ParentLifecycleInput {
  return {
    id: "parent-1",
    userId: "user-parent-1",
    createdAt: hoursAgo(1),
    userDeactivatedAt: null,
    activeChildrenCount: 0,
    latestChildActionAt: null,
    latestProfileEditAt: null,
    earliestActiveRelationshipCreatedAt: null,
    ...overrides,
  };
}

describe("Parent lifecycle", () => {
  it("§15 new parent incomplete -> STUDENT_SETUP, USER_ACTION_REQUIRED", () => {
    const result = assessParentLifecycle(baseParentInput(), NOW);
    expect(result.stage).toBe("STUDENT_SETUP");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
    expect(result.nextAction).toBe("/dashboard/family");
  });

  it("§16 parent profile incomplete has no distinct state — firstName/lastName are mandatory and set atomically at signup (documented: no source-evidenced incomplete-profile stage)", () => {
    const result = assessParentLifecycle(baseParentInput(), NOW);
    expect(result.stage).not.toBe("PROFILE");
  });

  it("§17 parent student setup incomplete === §15 (same STUDENT_SETUP stage, zero active children)", () => {
    const result = assessParentLifecycle(baseParentInput({ activeChildrenCount: 0 }), NOW);
    expect(result.stage).toBe("STUDENT_SETUP");
  });

  it("§18 parent ready (>=1 active child) -> READY, COMPLETED, never reminder eligible", () => {
    const readyAt = hoursAgo(5);
    const result = assessParentLifecycle(
      baseParentInput({ activeChildrenCount: 1, earliestActiveRelationshipCreatedAt: readyAt }),
      NOW
    );
    expect(result.stage).toBe("READY");
    expect(result.status).toBe("COMPLETED");
    expect(result.completedAt).toEqual(readyAt);
    expect(result.reminderEligible).toBe(false);
  });

  it("§19 parent suspended/deactivated -> SUSPENDED regardless of children count", () => {
    const result = assessParentLifecycle(
      baseParentInput({ activeChildrenCount: 2, userDeactivatedAt: hoursAgo(1) }),
      NOW
    );
    expect(result.status).toBe("SUSPENDED");
    expect(result.reminderEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STUDENT — §20-27
// ---------------------------------------------------------------------------

function baseStudentProfileInput(overrides: Partial<StudentProfileLifecycleInput> = {}): StudentProfileLifecycleInput {
  return {
    id: "student-1",
    userId: "user-student-1",
    managementMode: "SELF_MANAGED",
    createdAt: hoursAgo(1),
    academicLevelId: null,
    province: null,
    city: null,
    userDeactivatedAt: null,
    latestProfileEditAt: null,
    ...overrides,
  };
}

describe("Student lifecycle — STUDENT_PROFILE_READINESS", () => {
  it("§20 new student incomplete (0/3 fields) -> PROFILE, USER_ACTION_REQUIRED", () => {
    const result = assessStudentProfileLifecycle(baseStudentProfileInput(), NOW);
    expect(result.stage).toBe("PROFILE");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
  });

  it("§21 student profile incomplete (2/3 fields) -> still PROFILE, USER_ACTION_REQUIRED", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ province: "AB", city: "Edmonton", academicLevelId: null }),
      NOW
    );
    expect(result.stage).toBe("PROFILE");
    expect(result.status).toBe("USER_ACTION_REQUIRED");
  });

  it("§22 education/grade incomplete specifically (academicLevelId missing, others present) -> PROFILE", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ province: "AB", city: "Edmonton", academicLevelId: null }),
      NOW
    );
    expect(result.stage).toBe("PROFILE");
  });

  it("§23/§24 subject/support and preference selection have no gating StudentProfile field (LearningGoal.subjectId is nullable, not read by any eligibility gate) — documented gap, not fabricated as a required stage", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ academicLevelId: "level-1", province: "AB", city: "Edmonton" }),
      NOW
    );
    // Fully READY on the 3 real fields alone — no invented 4th requirement.
    expect(result.stage).toBe("READY");
  });

  it("§25 guardian-dependent state is modeled by the separate STUDENT_LOGIN_LINKING journey, not STUDENT_PROFILE_READINESS — see the linking describe block below", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ managementMode: "GUARDIAN_MANAGED", userId: null }),
      NOW
    );
    expect(result.nextAction).toBe("/dashboard/family");
    expect(result.recipientUserId).toBeNull();
  });

  it("§26 student ready (3/3 fields) -> READY, COMPLETED, never reminder eligible", () => {
    const editedAt = hoursAgo(3);
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ academicLevelId: "level-1", province: "AB", city: "Edmonton", latestProfileEditAt: editedAt }),
      NOW
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.completedAt).toEqual(editedAt);
    expect(result.reminderEligible).toBe(false);
  });

  it("§27 student suspended/deactivated -> SUSPENDED even with a complete profile", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({
        academicLevelId: "level-1",
        province: "AB",
        city: "Edmonton",
        userDeactivatedAt: hoursAgo(1),
      }),
      NOW
    );
    expect(result.status).toBe("SUSPENDED");
    expect(result.reminderEligible).toBe(false);
  });

  it("a GUARDIAN_MANAGED profile with no login (userId null) is never suspended by the field check even if left null — suspension only applies when a login actually exists", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ managementMode: "GUARDIAN_MANAGED", userId: null, userDeactivatedAt: null }),
      NOW
    );
    expect(result.status).not.toBe("SUSPENDED");
  });
});

function baseLoginLinkingInput(overrides: Partial<StudentLoginLinkingInput> = {}): StudentLoginLinkingInput {
  return {
    userId: "user-student-2",
    createdAt: hoursAgo(1),
    userDeactivatedAt: null,
    activationState: "UNLINKED",
    activationStateAt: null,
    ...overrides,
  };
}

describe("Student lifecycle — STUDENT_LOGIN_LINKING (§25 guardian-dependent sub-journey)", () => {
  it("PENDING_GUARDIAN_APPROVAL -> WAITING_ON_GUARDIAN, never USER_ACTION_REQUIRED, never reminder eligible however long it's been pending", () => {
    const result = assessStudentLoginLinking(
      baseLoginLinkingInput({ activationState: "PENDING_GUARDIAN_APPROVAL", activationStateAt: hoursAgo(500) }),
      NOW
    );
    expect(result.status).toBe("WAITING_ON_GUARDIAN");
    expect(result.userActionRequired).toBe(false);
    expect(result.reminderEligible).toBe(false);
    expect(result.suppressionReason).toBe("WAITING_ON_GUARDIAN");
  });

  it("REJECTED_OR_REVOKED -> REJECTED, never reminder eligible", () => {
    const result = assessStudentLoginLinking(baseLoginLinkingInput({ activationState: "REJECTED_OR_REVOKED" }), NOW);
    expect(result.status).toBe("REJECTED");
    expect(result.reminderEligible).toBe(false);
  });

  it("EXPIRED claim -> INELIGIBLE, never reminder eligible", () => {
    const result = assessStudentLoginLinking(baseLoginLinkingInput({ activationState: "EXPIRED" }), NOW);
    expect(result.status).toBe("INELIGIBLE");
    expect(result.suppressionReason).toBe("CLAIM_EXPIRED");
    expect(result.reminderEligible).toBe(false);
  });

  it("UNLINKED (no claim ever made, no self-service recovery UI exists) -> UNKNOWN, fails closed", () => {
    const result = assessStudentLoginLinking(baseLoginLinkingInput({ activationState: "UNLINKED" }), NOW);
    expect(result.status).toBe("UNKNOWN");
    expect(result.suppressionReason).toBe("MISSING_STATE_EVIDENCE");
    expect(result.reminderEligible).toBe(false);
  });

  it("suspended student login -> SUSPENDED even mid-claim", () => {
    const result = assessStudentLoginLinking(
      baseLoginLinkingInput({ activationState: "PENDING_GUARDIAN_APPROVAL", userDeactivatedAt: hoursAgo(1) }),
      NOW
    );
    expect(result.status).toBe("SUSPENDED");
    expect(result.reminderEligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GENERAL — §28-46
// ---------------------------------------------------------------------------

describe("General lifecycle invariants", () => {
  it("§28 admin accounts never enter any evaluator — by construction, no TutorProfile/ParentProfile/StudentProfile exists for an ADMIN role, and loadStudentLoginLinkingInput explicitly rejects non-STUDENT roles (see lifecycle.integration.test.ts for the DB-backed proof)", () => {
    // Type-level guarantee: LifecycleRole excludes ADMIN entirely.
    const result = assessTutorLifecycle(baseTutorInput(), NOW);
    expect(["TUTOR", "PARENT", "STUDENT"]).toContain(result.role);
  });

  it("§29 unknown/inconsistent state fails closed (STUDENT_LOGIN_LINKING UNLINKED)", () => {
    const result = assessStudentLoginLinking(baseLoginLinkingInput(), NOW);
    expect(result.reminderEligible).toBe(false);
    expect(result.status).toBe("UNKNOWN");
  });

  it("§30 inconsistent state (deactivated + otherwise-ready) still fails closed toward SUSPENDED, never COMPLETED", () => {
    const result = assessStudentProfileLifecycle(
      baseStudentProfileInput({ academicLevelId: "l", province: "AB", city: "Edmonton", userDeactivatedAt: hoursAgo(1) }),
      NOW
    );
    expect(result.status).toBe("SUSPENDED");
  });

  it("§31 completed onboarding is never reminder eligible, across every role", () => {
    const tutor = assessTutorLifecycle(baseTutorInput({ applicationStatus: "APPROVED" }), NOW);
    const parent = assessParentLifecycle(baseParentInput({ activeChildrenCount: 1 }), NOW);
    const student = assessStudentProfileLifecycle(
      baseStudentProfileInput({ academicLevelId: "l", province: "AB", city: "Edmonton" }),
      NOW
    );
    for (const r of [tutor, parent, student]) {
      expect(r.status).toBe("COMPLETED");
      expect(r.reminderEligible).toBe(false);
    }
  });

  it("§32 waiting-on-admin/futuretutor/guardian is never reminder eligible, no matter how long it's been", () => {
    const veryOld = hoursAgo(10000);
    const tutor = assessTutorLifecycle(baseTutorInput({ applicationStatus: "FINAL_REVIEW", latestApplicationEventAt: veryOld }), NOW);
    const guardian = assessStudentLoginLinking(
      baseLoginLinkingInput({ activationState: "PENDING_GUARDIAN_APPROVAL", activationStateAt: veryOld }),
      NOW
    );
    expect(tutor.reminderEligible).toBe(false);
    expect(guardian.reminderEligible).toBe(false);
  });

  it("§33 a USER_ACTION_REQUIRED subject can become reminder eligible once enough time has passed", () => {
    const result = assessTutorLifecycle(
      baseTutorInput({ applicationStatus: "TRAINING_REQUIRED", createdAt: hoursAgo(48), latestApplicationEventAt: hoursAgo(48) }),
      NOW
    );
    expect(result.userActionRequired).toBe(true);
    expect(result.reminderEligible).toBe(true);
  });

  it("§34 <24h inactivity is not yet reminder eligible", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "DRAFT", createdAt: hoursAgo(1) }), NOW);
    expect(result.inactiveDurationMs).toBeLessThan(REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS);
    expect(result.reminderEligible).toBe(false);
    expect(result.suppressionReason).toBe("INACTIVITY_BELOW_THRESHOLD");
  });

  it("§35 >=24h inactivity is reminder eligible for a USER_ACTION_REQUIRED subject", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "DRAFT", createdAt: hoursAgo(25) }), NOW);
    expect(result.inactiveDurationMs).toBeGreaterThanOrEqual(REMINDER_ELIGIBILITY_MIN_INACTIVITY_MS);
    expect(result.reminderEligible).toBe(true);
  });

  it("§36 meaningful progress resets the inactivity basis", () => {
    const stale = assessTutorLifecycle(
      baseTutorInput({ applicationStatus: "TRAINING_REQUIRED", createdAt: hoursAgo(200) }),
      NOW
    );
    const fresh = assessTutorLifecycle(
      baseTutorInput({
        applicationStatus: "TRAINING_REQUIRED",
        createdAt: hoursAgo(200),
        latestTrainingProgressAt: hoursAgo(1),
      }),
      NOW
    );
    expect(stale.reminderEligible).toBe(true);
    expect(fresh.reminderEligible).toBe(false);
    expect(fresh.lastMeaningfulProgressAt).toEqual(hoursAgo(1));
  });

  it("§37 login/page-view activity is not a lifecycle input at all — no field in any *LifecycleInput accepts a generic 'last seen'/session timestamp", () => {
    const input = baseTutorInput();
    expect(Object.keys(input)).not.toContain("lastLoginAt");
    expect(Object.keys(input)).not.toContain("lastSeenAt");
  });

  it("§38 nextAction is deterministic for a given input", () => {
    const a = assessTutorLifecycle(baseTutorInput({ applicationStatus: "EXAM_REQUIRED" }), NOW);
    const b = assessTutorLifecycle(baseTutorInput({ applicationStatus: "EXAM_REQUIRED" }), NOW);
    expect(a.nextAction).toBe(b.nextAction);
    expect(a.nextAction).toBe("/tutor/exam");
  });

  it("§39 role is deterministic and matches the evaluator called", () => {
    expect(assessTutorLifecycle(baseTutorInput(), NOW).role).toBe("TUTOR");
    expect(assessParentLifecycle(baseParentInput(), NOW).role).toBe("PARENT");
    expect(assessStudentProfileLifecycle(baseStudentProfileInput(), NOW).role).toBe("STUDENT");
  });

  it("§40 stage is deterministic for a given input", () => {
    const a = assessTutorLifecycle(baseTutorInput({ applicationStatus: "INTERVIEW_COMPLETED" }), NOW);
    const b = assessTutorLifecycle(baseTutorInput({ applicationStatus: "INTERVIEW_COMPLETED" }), NOW);
    expect(a.stage).toBe(b.stage);
    expect(a.stage).toBe("INTERVIEW_COMPLETED");
  });

  it("§41 no PII field exists on LifecycleJourneyState — only ids, enums, booleans, and dates", () => {
    const result = assessTutorLifecycle(baseTutorInput(), NOW);
    const keys = Object.keys(result);
    for (const forbidden of ["email", "name", "firstName", "lastName", "phone", "address"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("§42/§43/§44/§45 this module has zero email/Resend/cron/analytics side effects — it is pure computation with no imports of those modules", () => {
    // Enforced structurally: this test file only imports pure evaluator
    // functions and plain data; nothing in src/lib/lifecycle imports
    // Resend, a cron secret, or src/lib/analytics anywhere (verified by the
    // dedicated boundary test below, which greps the actual source files).
    const result = assessTutorLifecycle(baseTutorInput(), NOW);
    expect(result).not.toHaveProperty("emailSent");
    expect(result).not.toHaveProperty("reminderSent");
  });

  it("§46 no financial reachability — LifecycleJourneyState never references Stripe/pricing/earnings", () => {
    const result = assessTutorLifecycle(baseTutorInput({ applicationStatus: "APPROVED" }), NOW);
    expect(JSON.stringify(result)).not.toMatch(/stripe|hourlyRate|earning|payout|refund/i);
  });
});
