import type { TutorApplicationStatus } from "@/generated/prisma/enums";

export const TUTOR_JOURNEY_STEPS = ["profile", "documents", "interview", "training", "exam", "approved"] as const;

export type TutorJourneyStep = (typeof TUTOR_JOURNEY_STEPS)[number];
export type TutorJourneyState = "complete" | "current" | "pending" | "blocked" | "needsAction";
export type TutorExperienceTone = "success" | "warning" | "error" | "info" | "pending";

export interface TutorExperiencePresentation {
  tone: TutorExperienceTone;
  responsibleParty: "tutor" | "futureTutor" | "admin";
  nextActionHref?: string;
  journey: Record<TutorJourneyStep, TutorJourneyState>;
}

const journey = (
  complete: TutorJourneyStep[],
  active?: { step: TutorJourneyStep; state: Extract<TutorJourneyState, "current" | "needsAction"> },
): Record<TutorJourneyStep, TutorJourneyState> =>
  Object.fromEntries(
    TUTOR_JOURNEY_STEPS.map((step) => [
      step,
      complete.includes(step) ? "complete" : active?.step === step ? active.state : "pending",
    ]),
  ) as Record<TutorJourneyStep, TutorJourneyState>;

const blockedJourney = (): Record<TutorJourneyStep, TutorJourneyState> =>
  Object.fromEntries(TUTOR_JOURNEY_STEPS.map((step) => [step, "blocked"])) as Record<
    TutorJourneyStep,
    TutorJourneyState
  >;

export const TUTOR_EXPERIENCE: Record<TutorApplicationStatus, TutorExperiencePresentation> = {
  DRAFT: {
    tone: "info",
    responsibleParty: "tutor",
    nextActionHref: "/tutor/profile",
    journey: journey([], { step: "profile", state: "needsAction" }),
  },
  SUBMITTED: {
    tone: "pending",
    responsibleParty: "futureTutor",
    journey: journey(["profile"], { step: "documents", state: "current" }),
  },
  UNDER_REVIEW: {
    tone: "pending",
    responsibleParty: "futureTutor",
    journey: journey(["profile"], { step: "documents", state: "current" }),
  },
  INTERVIEW_REQUIRED: {
    tone: "info",
    responsibleParty: "futureTutor",
    journey: journey(["profile", "documents"], { step: "interview", state: "current" }),
  },
  INTERVIEW_COMPLETED: {
    tone: "pending",
    responsibleParty: "futureTutor",
    journey: journey(["profile", "documents", "interview"], { step: "training", state: "current" }),
  },
  TRAINING_REQUIRED: {
    tone: "warning",
    responsibleParty: "tutor",
    nextActionHref: "/tutor/training",
    journey: journey(["profile", "documents", "interview"], { step: "training", state: "needsAction" }),
  },
  TRAINING_COMPLETED: {
    tone: "pending",
    responsibleParty: "futureTutor",
    journey: journey(["profile", "documents", "interview", "training"], { step: "exam", state: "current" }),
  },
  EXAM_REQUIRED: {
    tone: "warning",
    responsibleParty: "tutor",
    nextActionHref: "/tutor/exam",
    journey: journey(["profile", "documents", "interview", "training"], { step: "exam", state: "needsAction" }),
  },
  EXAM_COMPLETED: {
    tone: "pending",
    responsibleParty: "futureTutor",
    journey: journey(["profile", "documents", "interview", "training", "exam"], {
      step: "approved",
      state: "current",
    }),
  },
  FINAL_REVIEW: {
    tone: "pending",
    responsibleParty: "futureTutor",
    journey: journey(["profile", "documents", "interview", "training", "exam"], {
      step: "approved",
      state: "current",
    }),
  },
  APPROVED: {
    tone: "success",
    responsibleParty: "futureTutor",
    journey: journey([...TUTOR_JOURNEY_STEPS]),
  },
  REJECTED: {
    tone: "error",
    responsibleParty: "futureTutor",
    journey: blockedJourney(),
  },
  SUSPENDED: {
    tone: "warning",
    responsibleParty: "admin",
    journey: blockedJourney(),
  },
};

export function getTutorExperience(status: TutorApplicationStatus): TutorExperiencePresentation {
  return TUTOR_EXPERIENCE[status];
}
