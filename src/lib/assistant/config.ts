/**
 * Ika — the FutureTutor AI assistant. Owner decisions (2026-11-28):
 * Claude Sonnet 5.5; 10 free questions a month (UTC calendar month) for
 * parents and approved tutors; +20 questions per paid session (parent who
 * paid) and +15 per completed session (tutor); a 50-question pack at
 * $4.99 CAD (never expires); the Ika+ plan at $9.99 CAD a month.
 */
export const ASSISTANT_MODEL = "claude-sonnet-5-5";
export const ASSISTANT_FREE_MONTHLY_QUESTIONS = 10;
export const ASSISTANT_MAX_QUESTION_CHARS = 2000;
/** Earlier turns sent back for context (user + assistant messages). */
export const ASSISTANT_MAX_HISTORY_MESSAGES = 12;
export const ASSISTANT_MAX_HISTORY_MESSAGE_CHARS = 6000;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 4000;
/** Photos are resized in the browser (longest side 1568 px, JPEG); ~4 MB of base64 is a generous ceiling. */
export const ASSISTANT_MAX_IMAGE_BASE64_CHARS = 4_000_000;

export type AssistantAudience = "PARENT" | "TUTOR";

/** Session bonuses count only sessions paid / completed from this date (launch of the bonus). */
export const IKA_BONUS_START = new Date("2026-11-28T00:00:00.000Z");
export const IKA_PARENT_SESSION_BONUS = 20;
export const IKA_TUTOR_SESSION_BONUS = 15;

export const IKA_PACK = { questions: 50, amountCents: 499, currency: "cad" } as const;
/** Ika+ — "unlimited" in the offer, with a fair-use ceiling per calendar month. */
export const IKA_PLAN = { amountCents: 999, currency: "cad", monthlyQuestions: 300 } as const;

/** The assistant is offered only when the server holds an API key. */
export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Start of the current calendar month, UTC. */
export function currentMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
