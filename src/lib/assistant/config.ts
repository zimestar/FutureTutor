/**
 * ASSISTANT-1 — Ika, the FutureTutor AI assistant. Settings. Owner decisions (2026-11-28):
 * Claude Sonnet 5.5, 10 free questions per parent per calendar month (UTC).
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

/** The assistant is offered only when the server holds an API key. */
export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Start of the current calendar month, UTC. */
export function currentMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
