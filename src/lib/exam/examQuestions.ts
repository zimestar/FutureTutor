/**
 * Client-safe exam content — question text, options, and display order only.
 * No correct-answer field exists anywhere in this module or its exported
 * types. See examAnswerKey.server.ts for the server-only grading data.
 */

export interface ExamOption {
  id: string;
  label: string;
}

export interface ExamQuestion {
  id: string;
  text: string;
  options: ExamOption[];
}

export const PLATFORM_EXAM_SLUG = "platform-exam-v1";
export const PLATFORM_EXAM_PASSING_SCORE = 80;

export const PLATFORM_EXAM_QUESTIONS: ExamQuestion[] = [
  {
    id: "q1",
    text: "A student asks to move all future communication off the FutureTutor platform (e.g. to personal phone/email) before your first session. What should you do?",
    options: [
      { id: "a", label: "Decline and keep all scheduling and messaging on the platform." },
      { id: "b", label: "Agree, since it's more convenient for both sides." },
      { id: "c", label: "Agree only if the student is an adult." },
      { id: "d", label: "Ignore the request and say nothing." },
    ],
  },
  {
    id: "q2",
    text: "You're going to be more than 10 minutes late to a confirmed session. What's the right first step?",
    options: [
      { id: "a", label: "Message the student/parent as soon as you know, before the session start time." },
      { id: "b", label: "Wait until the session time to see if they notice." },
      { id: "c", label: "Cancel the session without notice." },
      { id: "d", label: "Show up late without any message." },
    ],
  },
  {
    id: "q3",
    text: "A parent shares their child's home address as part of arranging an in-person session. Where should exact addresses be handled?",
    options: [
      { id: "a", label: "Only after a booking is confirmed, following FutureTutor's location-privacy policy." },
      { id: "b", label: "Publicly on your tutor profile, so any student can find you." },
      { id: "c", label: "Shared with other tutors for convenience." },
      { id: "d", label: "It doesn't matter when it's shared." },
    ],
  },
  {
    id: "q4",
    text: "What is the purpose of the end-of-session completion code?",
    options: [
      { id: "a", label: "It confirms the session actually took place, which is part of how tutor payout eligibility is determined." },
      { id: "b", label: "It's a discount code for the next session." },
      { id: "c", label: "It's required before the session can start." },
      { id: "d", label: "It has no functional purpose." },
    ],
  },
  {
    id: "q5",
    text: "A student cancels with very little notice, following FutureTutor's cancellation policy. As the tutor, what should you do?",
    options: [
      { id: "a", label: "Accept the outcome defined by the platform's cancellation policy — you don't set refund/compensation rules yourself." },
      { id: "b", label: "Contact the student directly to negotiate a different refund amount." },
      { id: "c", label: "Book another session immediately without telling anyone." },
      { id: "d", label: "Leave a public negative review of the student." },
    ],
  },
  {
    id: "q6",
    text: "During a session, a student discloses something that raises a genuine safety concern. What should you do?",
    options: [
      { id: "a", label: "Report it through FutureTutor's incident-reporting process." },
      { id: "b", label: "Handle it privately and never mention it to anyone." },
      { id: "c", label: "Post about it publicly to warn other tutors." },
      { id: "d", label: "Ignore it since it's not related to the subject being tutored." },
    ],
  },
  {
    id: "q7",
    text: "Can a tutor set their own price for what a student/parent pays?",
    options: [
      { id: "a", label: "No — FutureTutor determines the customer price; tutor payout is calculated independently." },
      { id: "b", label: "Yes, tutors are always free to set any customer price." },
      { id: "c", label: "Only for in-person sessions." },
      { id: "d", label: "Only after their first 10 sessions." },
    ],
  },
  {
    id: "q8",
    text: "What's the expected standard for session preparation and punctuality on FutureTutor?",
    options: [
      { id: "a", label: "Show up on time, prepared for the confirmed subject/topic, for every session you accept." },
      { id: "b", label: "Preparation is optional if the student doesn't ask for it." },
      { id: "c", label: "Punctuality only matters for in-person sessions." },
      { id: "d", label: "It's fine to accept sessions you don't intend to prepare for." },
    ],
  },
];
