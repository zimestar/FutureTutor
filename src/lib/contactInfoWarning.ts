/**
 * MESSAGING-MVP1B — approved off-platform-contact policy: a non-blocking UX
 * warning only. Deliberately NOT authorization/business logic — this
 * function's result must never gate sendMessage, never create a moderation
 * record, and never be treated as anything more than a soft nudge shown to
 * the sender before/after they submit. Keeps detection intentionally
 * simple and a little permissive (some false positives are an acceptable
 * cost for a non-blocking warning; false negatives cost nothing since this
 * isn't a security control).
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?\d[\s.-]?){7,}\d/;
const KEYWORD_PATTERN = /\b(whatsapp|telegram|signal app|my number|my cell|call me|text me)\b/i;

export function containsPossibleContactInfo(text: string): boolean {
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || KEYWORD_PATTERN.test(text);
}
