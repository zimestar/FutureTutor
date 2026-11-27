import { describe, expect, it } from "vitest";
import { classifyPipelineItem, waitingDays, MS_PER_DAY, type PipelineFacts } from "./pipelineQueue";

const NOW = new Date("2026-12-01T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * MS_PER_DAY);

function facts(overrides: Partial<PipelineFacts>): PipelineFacts {
  return {
    status: "UNDER_REVIEW",
    lastActivityAt: daysAgo(3),
    oldestPendingDocumentAt: null,
    hasApprovedEducationDocument: false,
    scheduledInterviewAt: null,
    ...overrides,
  };
}

describe("classifyPipelineItem", () => {
  it("puts drafts on the candidate", () => {
    expect(classifyPipelineItem(facts({ status: "DRAFT" }), NOW)).toMatchObject({ owner: "candidate", nextAction: "completeApplication" });
  });

  it("puts legacy SUBMITTED applications on the team", () => {
    expect(classifyPipelineItem(facts({ status: "SUBMITTED" }), NOW)).toMatchObject({ owner: "admin", nextAction: "startReview" });
  });

  it("asks the team to review pending documents, counting from the oldest upload", () => {
    const item = classifyPipelineItem(facts({ oldestPendingDocumentAt: daysAgo(5), hasApprovedEducationDocument: true }), NOW);
    expect(item).toMatchObject({ owner: "admin", nextAction: "reviewDocuments" });
    expect(waitingDays(item, NOW)).toBe(5);
  });

  it("moves to interview once education is approved and nothing is pending", () => {
    expect(classifyPipelineItem(facts({ hasApprovedEducationDocument: true }), NOW)).toMatchObject({ owner: "admin", nextAction: "requireInterview" });
  });

  it("waits on the candidate when no education document is approved or pending", () => {
    expect(classifyPipelineItem(facts({}), NOW)).toMatchObject({ owner: "candidate", nextAction: "uploadDocuments" });
  });

  it("asks the team to schedule an interview that has no date", () => {
    expect(classifyPipelineItem(facts({ status: "INTERVIEW_REQUIRED" }), NOW)).toMatchObject({ owner: "admin", nextAction: "scheduleInterview" });
  });

  it("waits on nobody before a scheduled interview, then on the team once it has passed", () => {
    const upcoming = classifyPipelineItem(facts({ status: "INTERVIEW_REQUIRED", scheduledInterviewAt: new Date(NOW.getTime() + MS_PER_DAY) }), NOW);
    expect(upcoming).toMatchObject({ owner: "none", nextAction: "attendInterview" });

    const past = classifyPipelineItem(facts({ status: "INTERVIEW_REQUIRED", scheduledInterviewAt: daysAgo(4) }), NOW);
    expect(past).toMatchObject({ owner: "admin", nextAction: "recordInterview" });
    expect(waitingDays(past, NOW)).toBe(4);
  });

  it.each([
    ["INTERVIEW_COMPLETED", "admin", "requireTraining"],
    ["TRAINING_REQUIRED", "candidate", "completeTraining"],
    ["TRAINING_COMPLETED", "admin", "requireExam"],
    ["EXAM_REQUIRED", "candidate", "passExam"],
    ["EXAM_COMPLETED", "admin", "sendToFinalReview"],
    ["FINAL_REVIEW", "admin", "finalDecision"],
    ["APPROVED", "none", "none"],
    ["REJECTED", "none", "none"],
  ] as const)("%s waits on %s (%s)", (status, owner, nextAction) => {
    expect(classifyPipelineItem(facts({ status }), NOW)).toMatchObject({ owner, nextAction });
  });

  it("never reports a negative wait", () => {
    expect(waitingDays({ waitingSince: new Date(NOW.getTime() + MS_PER_DAY) }, NOW)).toBe(0);
  });
});
