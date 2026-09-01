import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// PROD-TUTOR1 — Admin Interview UX fix. Root cause: InterviewRubricForm
// rendered the same editable 6-criteria form regardless of
// TutorInterview.status, so a genuinely successful "Save rubric" (verified
// directly against production data — no backend defect: scores persist,
// TutorInterview.status correctly becomes COMPLETED, and the tutor's
// applicationStatus correctly advances) looked identical to an untouched
// form. This suite proves the new AdminInterviewSection makes that already-
// correct state visible, without touching any backend workflow semantics.
// Follows this codebase's established source-text-assertion convention for
// UI (see tutorProfileDocumentUi.test.ts, tutorDocumentUploadUi.test.ts) —
// no React component-rendering harness is installed in this project.

describe("PROD-TUTOR1 — Admin Interview section state communication fix", () => {
  const section = readFileSync("src/components/dashboard/AdminInterviewSection.tsx", "utf8");
  const rubricForm = readFileSync("src/components/dashboard/InterviewRubricForm.tsx", "utf8");
  const adminPage = readFileSync("src/app/[locale]/admin/tutors/[id]/page.tsx", "utf8");
  const tutorInterviewAction = readFileSync("src/lib/actions/tutorInterview.ts", "utf8");
  const workflowService = readFileSync("src/services/tutorApplicationWorkflow.ts", "utf8");

  it("1. unscheduled state: renders only the 'not at interview stage' message, no form at all", () => {
    expect(section).toMatch(/if \(!showInitial\) \{\s*return <p[^>]*>\{t\("interviewNotYet"\)\}<\/p>;/);
  });

  it("2. scheduled-but-not-completed state: shows the schedule form AND the editable rubric form", () => {
    expect(section).toContain('action={scheduleInterviewAction.bind(null, tutorProfileId)}');
    expect(section).toContain("<InterviewRubricForm");
  });

  it("3. completed state: shows the completed badge and success message, not the bare editable form", () => {
    expect(section).toContain('t("interview.completedBadge")');
    expect(section).toContain('t("interview.completedMessage")');
    expect(section).toMatch(/if \(interview && isCompleted && !editing\)/);
  });

  it("4. persisted rubric values are displayed per criterion in the completed summary", () => {
    expect(section).toContain("evaluationByCriterion[criterion]");
    expect(section).toContain('t("interview.criterionScore"');
  });

  it("5. final score is derived from existing persisted evaluations, not a new formula (6 criteria x 5 max = 30)", () => {
    expect(section).toContain("export const MAX_SCORE_PER_CRITERION = 5");
    expect(section).toContain("const maxScore = CRITERIA.length * MAX_SCORE_PER_CRITERION");
    expect(section).toContain("const totalScore = interview.evaluations.reduce((sum, e) => sum + e.score, 0)");
    expect(section).toContain('t("interview.finalScore", { score: totalScore, max: maxScore })');
  });

  it("6. notes are shown when present, omitted when null — never a forced-visible empty field", () => {
    expect(section).toMatch(/\{evaluation\?\.notes && <p[^>]*>\{evaluation\.notes\}<\/p>\}/);
  });

  it("7. explicit success feedback appears immediately after a successful save, using the existing role=status pattern", () => {
    expect(rubricForm).toContain('role="status"');
    expect(rubricForm).toContain('t("saveSuccess")');
    expect(rubricForm).toContain("setJustSaved(true)");
  });

  it("8. the completed view is driven by server-sourced interview.status, not a client-only flag — survives a page refresh", () => {
    expect(section).toContain('const isCompleted = interview?.status === "COMPLETED"');
    // Confirms the prop is passed straight from fresh server data in the
    // page component (ISO-serialized, not a client-invented value).
    expect(adminPage).toContain("status: latestInterview.status");
  });

  it("9. 'Edit interview' only appears once completed — never invents edit capability for an incomplete interview", () => {
    const editButtonIdx = section.indexOf('t("interview.editInterview")');
    expect(editButtonIdx).toBeGreaterThan(-1);
    // It sits inside the `isCompleted && !editing` branch, not the default one.
    const branchIdx = section.indexOf("if (interview && isCompleted && !editing)");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(editButtonIdx).toBeGreaterThan(branchIdx);
  });

  it("10. no duplicate interview record is ever created — the schedule action's upsert-on-existing shape is untouched by this pass", () => {
    expect(workflowService).toContain("const existing = await tx.tutorInterview.findFirst({");
    expect(workflowService).toContain("? await tx.tutorInterview.update({");
  });

  it("11. Admin authorization is untouched — both actions still require ADMIN_TUTORS_REVIEW server-side, unchanged by this UI-only pass", () => {
    expect(tutorInterviewAction).toContain('requireAdminPermission(session, "ADMIN_TUTORS_REVIEW")');
    expect(section).toContain('import { scheduleInterviewAction } from "@/lib/actions/tutorInterview"');
    expect(section).toContain('import { InterviewRubricForm } from "@/components/dashboard/InterviewRubricForm"');
  });

  it("the completed interview's schedule/reschedule control is never rendered, even in edit mode — avoids accidentally resetting TutorInterview.status back to SCHEDULED", () => {
    // The schedule <form> only ever appears inside the `!isCompleted` block.
    const scheduleFormIdx = section.indexOf("scheduleInterviewAction.bind(null, tutorProfileId)");
    const notCompletedGuardIdx = section.indexOf("{!isCompleted && (");
    expect(notCompletedGuardIdx).toBeGreaterThan(-1);
    expect(scheduleFormIdx).toBeGreaterThan(notCompletedGuardIdx);
  });

  it("new/changed translation keys resolve in both English and French", () => {
    const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
    const fr = JSON.parse(readFileSync("messages/fr.json", "utf8"));
    const keys = [
      "saveSuccess", "completedBadge", "completedMessage", "completedOn",
      "finalScore", "criterionScore", "editInterview", "cancelEdit", "rescheduleInterview",
    ];
    for (const key of keys) {
      expect(en.admin.tutorDetail.interview[key], `en.admin.tutorDetail.interview.${key}`).toBeTruthy();
      expect(fr.admin.tutorDetail.interview[key], `fr.admin.tutorDetail.interview.${key}`).toBeTruthy();
    }
    for (const statusKey of ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]) {
      expect(en.admin.tutorDetail.interview.status[statusKey]).toBeTruthy();
      expect(fr.admin.tutorDetail.interview.status[statusKey]).toBeTruthy();
    }
  });
});
