import { describe, it, expect } from "vitest";
import { assessCadenceStep, nextDueReminderNumber } from "./cadence";
import { computeEpisodeKey, isEpisodeStillCurrent, computeReminderDedupeKey } from "./episode";
import { assessReminderCandidate } from "./reminderCandidate";
import { buildReminderDeepLink } from "./deepLink";
import { resolveContentKey, buildReminderEmailContent } from "./content";
import { LIFECYCLE_INACTIVITY_THRESHOLDS_MS } from "../config";
import type { LifecycleJourneyState } from "../types";

// LIFECYCLE-1B — deterministic tests for every schema-independent piece of
// the reminder engine (cadence, episode identity, deep links, content
// selection). Test numbering matches the mission's own Phase 19 checklist
// where a test is implementable without the not-yet-approved persistence
// layer; items requiring persisted send-history (duplicate prevention,
// concurrency, cron auth, batch processing) are covered by DESIGN in
// docs/lifecycle/LIFECYCLE-1B-REMINDER-ENGINE.md, not here — see that
// document's own "Test plan" section for the full mapping.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function baseState(overrides: Partial<LifecycleJourneyState> = {}): Pick<LifecycleJourneyState, "journey" | "subjectId" | "stage" | "status" | "lastMeaningfulProgressAt" | "inactiveDurationMs"> {
  return {
    journey: "TUTOR_CERTIFICATION",
    subjectId: "tutor-1",
    stage: "DRAFT",
    status: "USER_ACTION_REQUIRED",
    lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00.000Z"),
    inactiveDurationMs: 25 * HOUR,
    ...overrides,
  };
}

describe("Cadence — §1-6", () => {
  it("§1 R1 due at >=24h", () => {
    expect(assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.FIRST_REMINDER)).toBe(1);
    expect(assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.FIRST_REMINDER + 1000)).toBe(1);
  });

  it("§2 R1 not due <24h", () => {
    expect(assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.FIRST_REMINDER - 1)).toBeNull();
  });

  it("§3 R2 due >=72h", () => {
    expect(assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.SECOND_REMINDER)).toBe(2);
  });

  it("§4 R3 due >=7d", () => {
    expect(assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.THIRD_REMINDER)).toBe(3);
  });

  it("§5 R2 cannot precede R1 — even with huge elapsed time, an episode with no send history is only ever due for R1 first", () => {
    const cadenceStep = assessCadenceStep(30 * DAY); // far past R3's own threshold
    expect(nextDueReminderNumber(cadenceStep, [])).toBe(1);
  });

  it("§6 R3 cannot precede R2 — R2 already sent unlocks R3 only if elapsed time also justifies it, never skips ahead", () => {
    const cadenceStep2 = assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.SECOND_REMINDER); // exactly R2-eligible, not yet R3
    expect(nextDueReminderNumber(cadenceStep2, [1])).toBe(2);
    const cadenceStep3 = assessCadenceStep(LIFECYCLE_INACTIVITY_THRESHOLDS_MS.THIRD_REMINDER);
    expect(nextDueReminderNumber(cadenceStep3, [1, 2])).toBe(3);
    // R3 already sent -> sequence exhausted, never a 4th reminder
    expect(nextDueReminderNumber(cadenceStep3, [1, 2, 3])).toBeNull();
  });
});

describe("Episode identity — §9-10 (stop-on-progress)", () => {
  it("§9 progress (anchor change) invalidates the old episode — same stage, different lastMeaningfulProgressAt produces a different key", () => {
    const before = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "TRAINING_REQUIRED", lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") });
    const after = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "TRAINING_REQUIRED", lastMeaningfulProgressAt: new Date("2026-09-02T06:00:00Z") });
    expect(before).not.toBe(after);
    expect(isEpisodeStillCurrent(before!, { journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "TRAINING_REQUIRED", lastMeaningfulProgressAt: new Date("2026-09-02T06:00:00Z") })).toBe(false);
  });

  it("§10 a new actionable stage creates a new episode", () => {
    const anchor = new Date("2026-09-01T00:00:00Z");
    const training = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "TRAINING_REQUIRED", lastMeaningfulProgressAt: anchor });
    const exam = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "EXAM_REQUIRED", lastMeaningfulProgressAt: anchor });
    expect(training).not.toBe(exam);
  });

  it("a stable state (no progress, same stage) produces the SAME episode key across repeated evaluations — required for idempotent dedupeKey reuse", () => {
    const state = { journey: "TUTOR_CERTIFICATION" as const, subjectId: "t1", stage: "DRAFT" as const, lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") };
    expect(computeEpisodeKey(state)).toBe(computeEpisodeKey({ ...state }));
  });

  it("dedupeKey is deterministic and reminder-number-specific", () => {
    const key = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "DRAFT", lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") })!;
    expect(computeReminderDedupeKey(key, 1)).not.toBe(computeReminderDedupeKey(key, 2));
    expect(computeReminderDedupeKey(key, 1)).toBe(computeReminderDedupeKey(key, 1));
  });
});

describe("Reminder candidate assessment — §11-18 (suppression)", () => {
  it("§11 completed suppresses (no candidate)", () => {
    expect(assessReminderCandidate(baseState({ status: "COMPLETED" }))).toBeNull();
  });
  it("§12 rejected suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "REJECTED" }))).toBeNull();
  });
  it("§13 suspended suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "SUSPENDED" }))).toBeNull();
  });
  it("§14 deactivated (modeled as SUSPENDED status by LIFECYCLE-1A) suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "SUSPENDED" }))).toBeNull();
  });
  it("§15 waiting-on-admin suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "WAITING_ON_ADMIN" }))).toBeNull();
  });
  it("§16 waiting-on-FutureTutor suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "WAITING_ON_FUTURETUTOR" }))).toBeNull();
  });
  it("§17 waiting-on-guardian suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "WAITING_ON_GUARDIAN" }))).toBeNull();
  });
  it("§18 unknown suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "UNKNOWN" }))).toBeNull();
  });
  it("missing progress anchor (MISSING_STATE_EVIDENCE) suppresses even if otherwise USER_ACTION_REQUIRED", () => {
    expect(assessReminderCandidate(baseState({ lastMeaningfulProgressAt: null, inactiveDurationMs: null }))).toBeNull();
  });
  it("a genuinely eligible USER_ACTION_REQUIRED subject produces a real R1 candidate", () => {
    const candidate = assessReminderCandidate(baseState());
    expect(candidate).not.toBeNull();
    expect(candidate!.reminderNumber).toBe(1);
    expect(candidate!.episodeKey).toContain("tutor-1");
  });
  it("§28 stale pre-send state suppresses — recomputing the candidate against an updated (progressed) state yields a different/no episode", () => {
    const original = assessReminderCandidate(baseState())!;
    const progressed = baseState({ lastMeaningfulProgressAt: new Date(), inactiveDurationMs: 0 });
    const recheck = assessReminderCandidate(progressed);
    expect(recheck).toBeNull(); // <24h since the (now recent) progress — no longer due
    expect(isEpisodeStillCurrent(original.episodeKey, progressed)).toBe(false);
  });
});

describe("Deep link — §26-27", () => {
  it("§26 builds a correct, canonical deep link from nextAction + locale", () => {
    const url = buildReminderDeepLink("/tutor/training", "en", "https://futuretutor.ca");
    expect(url).toBe("https://futuretutor.ca/en/tutor/training");
  });
  it("§27 no PII in deep link — never contains an id, email, or query string", () => {
    const url = buildReminderDeepLink("/dashboard/family", "fr", "https://futuretutor.ca")!;
    expect(url).not.toMatch(/[?&]|@|profileId|userId|studentId|parentId|tutorId/i);
  });
  it("returns null when there is no next action (nothing to link to)", () => {
    expect(buildReminderDeepLink(null, "en", "https://futuretutor.ca")).toBeNull();
  });
  it("returns null for an insecure/local override (reuses resolveBookingEmailBaseUrl's own fail-closed rule)", () => {
    expect(buildReminderDeepLink("/tutor/training", "en", "http://localhost:3000")).toBeNull();
  });
});

describe("Content selection and rendering — §23-25", () => {
  it("resolves the correct content key per role/stage/relationship, and null for any non-actionable combination", () => {
    expect(resolveContentKey({ role: "TUTOR", stage: "DRAFT", relationship: "SELF" })).toBe("TUTOR_DRAFT");
    expect(resolveContentKey({ role: "TUTOR", stage: "TRAINING_REQUIRED", relationship: "SELF" })).toBe("TUTOR_TRAINING_REQUIRED");
    expect(resolveContentKey({ role: "TUTOR", stage: "EXAM_REQUIRED", relationship: "SELF" })).toBe("TUTOR_EXAM_REQUIRED");
    expect(resolveContentKey({ role: "PARENT", stage: "STUDENT_SETUP", relationship: "SELF" })).toBe("PARENT_STUDENT_SETUP");
    expect(resolveContentKey({ role: "STUDENT", stage: "PROFILE", relationship: "SELF" })).toBe("STUDENT_PROFILE_SELF");
    expect(resolveContentKey({ role: "STUDENT", stage: "PROFILE", relationship: "GUARDIAN" })).toBe("STUDENT_PROFILE_GUARDIAN");
    expect(resolveContentKey({ role: "TUTOR", stage: "UNDER_REVIEW", relationship: "SELF" })).toBeNull();
    expect(resolveContentKey({ role: "STUDENT", stage: "READY", relationship: "SELF" })).toBeNull();
  });

  it("§23 renders real EN content, distinct per reminder number (R2 is not a duplicate of R1, R3 differs from both)", () => {
    const ctx = { locale: "en" as const, recipientFirstName: "Alex", relationship: "SELF" as const, role: "TUTOR" as const, stage: "DRAFT" as const, deepLinkUrl: "https://futuretutor.ca/en/tutor/profile" };
    const r1 = buildReminderEmailContent({ ...ctx, reminderNumber: 1 })!;
    const r2 = buildReminderEmailContent({ ...ctx, reminderNumber: 2 })!;
    const r3 = buildReminderEmailContent({ ...ctx, reminderNumber: 3 })!;
    expect(r1.subject).not.toBe(r2.subject);
    expect(r2.subject).not.toBe(r3.subject);
    expect(r1.html).not.toBe(r2.html);
    expect(r1.html).toContain("Alex");
    expect(r1.html).not.toMatch(/last chance/i);
    expect(r2.html).not.toMatch(/last chance/i);
    expect(r3.html).not.toMatch(/last chance/i);
  });

  it("§24 renders real, natively-written FR content (not identical to EN)", () => {
    const ctx = { locale: "fr" as const, recipientFirstName: "Alex", relationship: "SELF" as const, role: "PARENT" as const, stage: "STUDENT_SETUP" as const, deepLinkUrl: "https://futuretutor.ca/fr/dashboard/family" };
    const fr = buildReminderEmailContent({ ...ctx, reminderNumber: 1 })!;
    const en = buildReminderEmailContent({ ...ctx, locale: "en", reminderNumber: 1 })!;
    expect(fr.subject).not.toBe(en.subject);
    expect(fr.html).toMatch(/Bonjour/);
  });

  it("§25 deterministic locale fallback — an unsupported locale candidate resolves to the app default (en), never throws", () => {
    const ctx = { locale: "de" as unknown as "en", recipientFirstName: "Alex", relationship: "SELF" as const, role: "TUTOR" as const, stage: "DRAFT" as const, reminderNumber: 1 as const, deepLinkUrl: "https://futuretutor.ca/en/tutor/profile" };
    const content = buildReminderEmailContent(ctx);
    expect(content).not.toBeNull();
    expect(content!.html).toMatch(/lang="en"/);
  });

  it("guardian content substitutes the child's first name, never the guardian's own", () => {
    const content = buildReminderEmailContent({
      locale: "en",
      recipientFirstName: "ParentName",
      relationship: "GUARDIAN",
      role: "STUDENT",
      stage: "PROFILE",
      reminderNumber: 1,
      deepLinkUrl: "https://futuretutor.ca/en/dashboard/family",
      recipientChildFirstName: "ChildName",
    })!;
    expect(content.subject).toContain("ChildName");
    expect(content.subject).not.toContain("ParentName");
  });

  it("returns null for a role/stage combination with no defined content (fail-closed, never a guessed template)", () => {
    expect(
      buildReminderEmailContent({ locale: "en", recipientFirstName: "Alex", relationship: "SELF", role: "TUTOR", stage: "APPROVED", reminderNumber: 1, deepLinkUrl: "https://futuretutor.ca/en/tutor/dashboard" })
    ).toBeNull();
  });
});

describe("Financial reachability — zero", () => {
  it("no reminder module references Stripe/payment/pricing/financial symbols", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/stripe|paymentAttempt|tutorEarning|tutorTransfer|refund|payout|PAYMENT_MODE/i);
    }
  });

  it("no reminder module invokes Resend or sends email — content/link/recipient building only, no send call anywhere", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/getResendClient|\.emails\.send|resend\.emails/i);
    }
  });

  it("no cron route or scheduled job was created by this mission", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(__dirname, "..", "..", "..", "app", "api", "cron", "lifecycle-reminders-tick"))).toBe(false);
  });
});
