export type SessionArrivalPresentation =
  | "preWindow"
  | "ready"
  | "waitingForTutor"
  | "waitingForStudent"
  | "graceReady"
  | "graceWaitingForTutor"
  | "graceWaitingForStudent"
  | "deadlinePending"
  | "inProgress"
  | "completionPending"
  | "completed"
  | "interrupted"
  | "studentNoShow"
  | "tutorNoShow"
  | "neutralNoShow"
  | "unavailable";

export function sessionStateTranslationKeys(presentation: SessionArrivalPresentation) {
  return {
    label: `states.${presentation}.label` as const,
    title: `states.${presentation}.title` as const,
    description: `states.${presentation}.description` as const,
  };
}

export function deriveSessionArrivalPresentation(input: {
  status: string;
  now: Date;
  checkInWindowOpensAt: Date;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  graceDeadlineAt: Date;
  tutorPresenceRecorded: boolean;
  studentPresenceRecorded: boolean;
  noShowOutcome: "STUDENT_NO_SHOW" | "TUTOR_NO_SHOW" | "NO_SHOW_UNRESOLVED" | null;
}): SessionArrivalPresentation {
  if (input.status === "COMPLETED") return "completed";
  if (input.status === "INTERRUPTED") return "interrupted";
  if (input.status === "NO_SHOW") {
    if (input.noShowOutcome === "STUDENT_NO_SHOW") return "studentNoShow";
    if (input.noShowOutcome === "TUTOR_NO_SHOW") return "tutorNoShow";
    return "neutralNoShow";
  }
  if (input.status === "IN_PROGRESS") return input.now >= input.scheduledEndAt ? "completionPending" : "inProgress";
  if (input.status !== "SCHEDULED") return "unavailable";
  if (input.now < input.checkInWindowOpensAt) return "preWindow";
  if (input.now >= input.graceDeadlineAt) return "deadlinePending";
  if (input.now >= input.scheduledStartAt) {
    if (input.tutorPresenceRecorded && !input.studentPresenceRecorded) return "graceWaitingForStudent";
    if (input.studentPresenceRecorded && !input.tutorPresenceRecorded) return "graceWaitingForTutor";
    return "graceReady";
  }
  if (input.tutorPresenceRecorded && !input.studentPresenceRecorded) return "waitingForStudent";
  if (input.studentPresenceRecorded && !input.tutorPresenceRecorded) return "waitingForTutor";
  return "ready";
}

export type SessionCheckInErrorCode = "tooEarly" | "notAuthorized" | "notEligible" | "generic";

export function sessionCheckInErrorCode(error: unknown): SessionCheckInErrorCode {
  if (error === "tooEarly" || error === "notAuthorized" || error === "notEligible") return error;
  return "generic";
}

export function sessionCheckInControls(allowedActions: readonly string[]) {
  return {
    tutor: allowedActions.includes("CHECK_IN_AS_TUTOR"),
    student: allowedActions.includes("CHECK_IN_AS_STUDENT"),
  };
}

export function studentCheckInLabelKind(viewerRole: string): "guardian" | "tutor" | "self" {
  if (viewerRole === "GUARDIAN") return "guardian";
  if (viewerRole === "TUTOR_OWNER") return "tutor";
  return "self";
}

export function isTerminalNoShowPresentation(presentation: SessionArrivalPresentation): boolean {
  return presentation === "studentNoShow" || presentation === "tutorNoShow" || presentation === "neutralNoShow";
}

export function isTerminalSessionPresentation(presentation: SessionArrivalPresentation): boolean {
  return isTerminalNoShowPresentation(presentation) || presentation === "completed" || presentation === "interrupted";
}

export type PostSessionNavigationAction = "bookings" | "tutorDashboard" | "findTutor";

export function postSessionNavigationActions(
  presentation: SessionArrivalPresentation,
  viewerRole: string,
): PostSessionNavigationAction[] {
  if (!isTerminalSessionPresentation(presentation)) return [];
  return viewerRole === "TUTOR_OWNER"
    ? ["bookings", "tutorDashboard"]
    : ["bookings", "findTutor"];
}

export function postSessionNavigationHref(action: PostSessionNavigationAction, viewerRole: string): string {
  if (action === "bookings") return viewerRole === "TUTOR_OWNER" ? "/tutor/bookings" : "/dashboard/bookings";
  if (action === "tutorDashboard") return "/tutor/dashboard";
  return "/find-tutors";
}

export function noShowCopyKind(
  viewerRole: string,
  outcome: "STUDENT_NO_SHOW" | "TUTOR_NO_SHOW" | "NO_SHOW_UNRESOLVED" | null,
): "studentAbsentTutor" | "studentAbsentLearner" | "tutorAbsentTutor" | "tutorAbsentLearner" | "neutral" {
  if (outcome === "STUDENT_NO_SHOW") return viewerRole === "TUTOR_OWNER" ? "studentAbsentTutor" : "studentAbsentLearner";
  if (outcome === "TUTOR_NO_SHOW") return viewerRole === "TUTOR_OWNER" ? "tutorAbsentTutor" : "tutorAbsentLearner";
  return "neutral";
}

export function graceRemainingParts(deadlineAt: Date, now: Date): { minutes: number; seconds: number; expired: boolean } {
  const remainingSeconds = Math.max(0, Math.ceil((deadlineAt.getTime() - now.getTime()) / 1000));
  return {
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60,
    expired: remainingSeconds === 0,
  };
}

export function shouldRefreshSessionAfterCheckIn(state: { success?: boolean; error?: string } | undefined): boolean {
  return state?.success === true || state?.error === "notEligible";
}

export function shouldShowSessionCheckIn(presentation: SessionArrivalPresentation, allowedActions: readonly string[]): boolean {
  return allowedActions.length > 0 && presentation !== "deadlinePending" && presentation !== "completionPending" && presentation !== "inProgress" && !isTerminalSessionPresentation(presentation);
}
