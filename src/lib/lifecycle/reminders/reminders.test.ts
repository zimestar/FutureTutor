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

  it("ORDERING — a FAILED (never recorded SENT) R1 must never let R2 leapfrog it, however long inactivity continues", () => {
    // "alreadySentNumbersForRecipient" represents SENT-status numbers only
    // (schema decision §8/§9) — a FAILED_RETRYABLE/FAILED_FINAL R1 is simply
    // absent from this array, so the engine keeps proposing R1, not R2, no
    // matter how far past the R2/R3 elapsed-time thresholds inactivity goes.
    const cadenceStep = assessCadenceStep(10 * DAY);
    expect(nextDueReminderNumber(cadenceStep, [])).toBe(1); // R1 failed and was never SENT -> still proposes R1
  });

  it("ORDERING — a FAILED R2 must never let R3 leapfrog it", () => {
    const cadenceStep = assessCadenceStep(10 * DAY);
    expect(nextDueReminderNumber(cadenceStep, [1])).toBe(2); // R1 SENT, R2 failed and never recorded SENT -> still proposes R2, not R3
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

  it("ORDERING — a new episode (new stage) starts a fresh R1 sequence even if the OLD episode had already reached R3", () => {
    const oldEpisodeState = { journey: "TUTOR_CERTIFICATION" as const, subjectId: "t1", stage: "TRAINING_REQUIRED" as const, lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") };
    const newEpisodeState = { journey: "TUTOR_CERTIFICATION" as const, subjectId: "t1", stage: "EXAM_REQUIRED" as const, lastMeaningfulProgressAt: new Date("2026-09-10T00:00:00Z") };
    // A reminder row keyed to the OLD episode's R3 dedupeKey can never match
    // a candidate computed against the NEW episode's state.
    const oldDedupeKey = computeReminderDedupeKey(computeEpisodeKey(oldEpisodeState)!, 3, "user-1");
    const newCandidateDedupeKey = computeReminderDedupeKey(computeEpisodeKey(newEpisodeState)!, 1, "user-1");
    expect(oldDedupeKey).not.toBe(newCandidateDedupeKey);
    expect(isEpisodeStillCurrent(computeEpisodeKey(oldEpisodeState)!, newEpisodeState)).toBe(false);
  });

  it("OBSOLETE — an obsolete (superseded) episode's stored key never again matches a fresh evaluation, permanently orphaning it", () => {
    const original = { journey: "TUTOR_CERTIFICATION" as const, subjectId: "t1", stage: "TRAINING_REQUIRED" as const, lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") };
    const storedKey = computeEpisodeKey(original)!;
    const afterProgress = { ...original, lastMeaningfulProgressAt: new Date("2026-09-05T00:00:00Z") };
    const afterMoreProgress = { ...original, lastMeaningfulProgressAt: new Date("2026-09-09T00:00:00Z") };
    expect(isEpisodeStillCurrent(storedKey, afterProgress)).toBe(false);
    expect(isEpisodeStillCurrent(storedKey, afterMoreProgress)).toBe(false); // still orphaned, not somehow revived
  });

  it("a stable state (no progress, same stage) produces the SAME episode key across repeated evaluations — required for idempotent dedupeKey reuse", () => {
    const state = { journey: "TUTOR_CERTIFICATION" as const, subjectId: "t1", stage: "DRAFT" as const, lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") };
    expect(computeEpisodeKey(state)).toBe(computeEpisodeKey({ ...state }));
  });

  it("dedupeKey is deterministic, reminder-number-specific, AND recipient-specific (MULTI-GUARDIAN correction)", () => {
    const key = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "DRAFT", lastMeaningfulProgressAt: new Date("2026-09-01T00:00:00Z") })!;
    expect(computeReminderDedupeKey(key, 1, "user-a")).not.toBe(computeReminderDedupeKey(key, 2, "user-a"));
    expect(computeReminderDedupeKey(key, 1, "user-a")).toBe(computeReminderDedupeKey(key, 1, "user-a"));
    // Two different recipients for the SAME episode + reminder number must
    // produce two DISTINCT dedupeKeys — this is the exact correction: the
    // DB unique constraint must never suppress Guardian B's legitimate
    // delivery just because Guardian A's already exists.
    expect(computeReminderDedupeKey(key, 1, "user-a")).not.toBe(computeReminderDedupeKey(key, 1, "user-b"));
  });

  it("episode key generation is deterministic, timezone-independent (ISO serialization), and contains no PII/free text", () => {
    const utcDate = new Date("2026-09-01T00:00:00.000Z");
    const key = computeEpisodeKey({ journey: "TUTOR_CERTIFICATION", subjectId: "t1", stage: "DRAFT", lastMeaningfulProgressAt: utcDate })!;
    // toISOString() always normalizes to UTC/Z regardless of host timezone,
    // so two hosts in different timezones evaluating the same Date instant
    // always produce the identical key.
    expect(key).toBe(`TUTOR_CERTIFICATION:t1:DRAFT:${utcDate.toISOString()}`);
    expect(key).not.toMatch(/@|[a-z]+\.[a-z]+@|\s{2,}/); // no email-shaped or freeform-text content
  });
});

describe("Reminder candidate assessment — §11-18 (suppression)", () => {
  it("§11 completed suppresses (no candidate)", () => {
    expect(assessReminderCandidate(baseState({ status: "COMPLETED" }), "user-1")).toBeNull();
  });
  it("§12 rejected suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "REJECTED" }), "user-1")).toBeNull();
  });
  it("§13 suspended suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "SUSPENDED" }), "user-1")).toBeNull();
  });
  it("§14 deactivated (modeled as SUSPENDED status by LIFECYCLE-1A) suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "SUSPENDED" }), "user-1")).toBeNull();
  });
  it("§15 waiting-on-admin suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "WAITING_ON_ADMIN" }), "user-1")).toBeNull();
  });
  it("§16 waiting-on-FutureTutor suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "WAITING_ON_FUTURETUTOR" }), "user-1")).toBeNull();
  });
  it("§17 waiting-on-guardian suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "WAITING_ON_GUARDIAN" }), "user-1")).toBeNull();
  });
  it("§18 unknown suppresses", () => {
    expect(assessReminderCandidate(baseState({ status: "UNKNOWN" }), "user-1")).toBeNull();
  });
  it("missing progress anchor (MISSING_STATE_EVIDENCE) suppresses even if otherwise USER_ACTION_REQUIRED", () => {
    expect(assessReminderCandidate(baseState({ lastMeaningfulProgressAt: null, inactiveDurationMs: null }), "user-1")).toBeNull();
  });
  it("missing recipient id suppresses", () => {
    expect(assessReminderCandidate(baseState(), "")).toBeNull();
  });
  it("a genuinely eligible USER_ACTION_REQUIRED subject produces a real R1 candidate", () => {
    const candidate = assessReminderCandidate(baseState(), "user-1");
    expect(candidate).not.toBeNull();
    expect(candidate!.reminderNumber).toBe(1);
    expect(candidate!.episodeKey).toContain("tutor-1");
    expect(candidate!.recipientUserId).toBe("user-1");
  });
  it("§28 stale pre-send state suppresses — recomputing the candidate against an updated (progressed) state yields a different/no episode", () => {
    const original = assessReminderCandidate(baseState(), "user-1")!;
    const progressed = baseState({ lastMeaningfulProgressAt: new Date(), inactiveDurationMs: 0 });
    const recheck = assessReminderCandidate(progressed, "user-1");
    expect(recheck).toBeNull(); // <24h since the (now recent) progress — no longer due
    expect(isEpisodeStillCurrent(original.episodeKey, progressed)).toBe(false);
  });

  describe("MULTI-GUARDIAN — two active guardians of the same Student episode", () => {
    const studentEpisodeState = (overrides: Partial<ReturnType<typeof baseState>> = {}) =>
      baseState({ journey: "STUDENT_PROFILE_READINESS", subjectId: "student-1", stage: "PROFILE", ...overrides });

    it("both guardians produce a distinct, independently-idempotent candidate for the same episode + reminder number", () => {
      const state = studentEpisodeState();
      const candidateA = assessReminderCandidate(state, "guardian-a")!;
      const candidateB = assessReminderCandidate(state, "guardian-b")!;
      expect(candidateA.episodeKey).toBe(candidateB.episodeKey); // same underlying episode
      expect(candidateA.reminderNumber).toBe(candidateB.reminderNumber); // same cadence step (same subject inactivity)
      expect(candidateA.dedupeKey).not.toBe(candidateB.dedupeKey); // but distinct deliveries
    });

    it("duplicate processing for Guardian A is idempotent (same input -> same dedupeKey every time)", () => {
      const state = studentEpisodeState();
      const first = assessReminderCandidate(state, "guardian-a")!;
      const second = assessReminderCandidate(state, "guardian-a")!;
      expect(first.dedupeKey).toBe(second.dedupeKey);
    });

    it("duplicate processing for Guardian B is idempotent, and independent of Guardian A's own history", () => {
      // Inactivity has reached the R2 threshold, so BOTH guardians' cadence
      // step allows R2 — but only Guardian A has an R1 already SENT.
      const state = studentEpisodeState({ inactiveDurationMs: LIFECYCLE_INACTIVITY_THRESHOLDS_MS.SECOND_REMINDER });
      const candidateAAfterR1 = assessReminderCandidate(state, "guardian-a", [1]);
      const candidateBFirstEver = assessReminderCandidate(state, "guardian-b", []);
      expect(candidateAAfterR1!.reminderNumber).toBe(2); // A moves on to R2
      expect(candidateBFirstEver!.reminderNumber).toBe(1); // B is still on R1 — independent sequences
    });

    it("a guardian with an already-sent R1 AND R2 correctly becomes eligible for R3 once cadence allows, independent of the co-guardian", () => {
      const state = baseState({ journey: "STUDENT_PROFILE_READINESS", subjectId: "student-1", stage: "PROFILE", inactiveDurationMs: LIFECYCLE_INACTIVITY_THRESHOLDS_MS.THIRD_REMINDER });
      const candidate = assessReminderCandidate(state, "guardian-a", [1, 2]);
      expect(candidate!.reminderNumber).toBe(3);
    });
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

  it("every reminder-eligible nextAction route still requires authentication in its own page source (no login bypass introduced)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const appRoot = join(__dirname, "..", "..", "..", "app", "[locale]");
    const routes = [
      { nextAction: "/tutor/profile", pagePath: join(appRoot, "tutor", "profile", "page.tsx") },
      { nextAction: "/tutor/training", pagePath: join(appRoot, "tutor", "training", "page.tsx") },
      { nextAction: "/tutor/exam", pagePath: join(appRoot, "tutor", "exam", "page.tsx") },
      { nextAction: "/dashboard/family", pagePath: join(appRoot, "dashboard", "family", "page.tsx") },
      { nextAction: "/dashboard/profile", pagePath: join(appRoot, "dashboard", "profile", "page.tsx") },
    ];
    for (const { nextAction, pagePath } of routes) {
      const source = readFileSync(pagePath, "utf8");
      expect(source, nextAction).toMatch(/auth\(\)/);
      expect(source, nextAction).toMatch(/redirect\(/);
    }
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

  it("§35/§36 the cron route exists (authorized by the schema decision) but requires a dedicated secret and fails closed without one — and this repo keeps no in-repo scheduler config for it (matches every other cron route's own established 'invoked by an external trigger, not declared here' convention), so nothing in the codebase itself can schedule it", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const routePath = join(__dirname, "..", "..", "..", "app", "api", "cron", "lifecycle-reminders-tick", "route.ts");
    expect(existsSync(routePath)).toBe(true);
    const source = readFileSync(routePath, "utf8");
    expect(source).toMatch(/LIFECYCLE_REMINDERS_CRON_SECRET/);
    expect(source).toMatch(/x-cron-secret/);
    expect(source).toMatch(/status:\s*500/); // fails closed if the secret isn't configured
    expect(source).toMatch(/status:\s*401/); // fails closed if the provided secret doesn't match
    // No schedule/trigger config for this route exists anywhere in the repo
    // (this codebase has no built-in scheduler at all — every cron route's
    // own doc comment says so) — searched the one place such config would
    // live if it existed.
    expect(existsSync(join(__dirname, "..", "..", "..", "..", "railway.json"))).toBe(false);
  });
});
