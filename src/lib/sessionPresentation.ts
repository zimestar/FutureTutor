export type SessionArrivalPresentation =
  | "preWindow"
  | "ready"
  | "waitingForTutor"
  | "waitingForStudent"
  | "inProgress"
  | "unavailable";

export function deriveSessionArrivalPresentation(input: {
  status: string;
  now: Date;
  checkInWindowOpensAt: Date;
  tutorPresenceRecorded: boolean;
  studentPresenceRecorded: boolean;
}): SessionArrivalPresentation {
  if (input.status === "IN_PROGRESS") return "inProgress";
  if (input.status !== "SCHEDULED") return "unavailable";
  if (input.now < input.checkInWindowOpensAt) return "preWindow";
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
