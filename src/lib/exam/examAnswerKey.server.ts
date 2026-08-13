import "server-only";
import { PLATFORM_EXAM_PASSING_SCORE, PLATFORM_EXAM_QUESTIONS } from "./examQuestions";

/**
 * Server-only grading data. The "server-only" import above makes any
 * accidental import of this module from client code fail at build time,
 * not just by convention — this is the single place correct answers exist.
 */
const ANSWER_KEY: Record<string, string> = {
  q1: "a",
  q2: "a",
  q3: "a",
  q4: "a",
  q5: "a",
  q6: "a",
  q7: "a",
  q8: "a",
};

export function scoreExam(answers: Record<string, string>): { score: number; passed: boolean } {
  const questionIds = PLATFORM_EXAM_QUESTIONS.map((q) => q.id);
  const correctCount = questionIds.filter((id) => answers[id] === ANSWER_KEY[id]).length;
  const score = Math.round((correctCount / questionIds.length) * 100);
  return { score, passed: score >= PLATFORM_EXAM_PASSING_SCORE };
}
