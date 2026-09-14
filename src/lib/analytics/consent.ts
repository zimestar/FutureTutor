/**
 * DATA-1 — client-side consent state machine for the ANALYTICS category.
 *
 * This is deliberately NOT the same thing as the `ConsentRecord` Prisma
 * model (Phase H.1): that model is scoped to an authenticated `actorUserId`
 * (a real User FK) and exists for a different concern entirely (guardian/
 * legal consent tied to a real account). Cookie-banner analytics consent
 * must work for anonymous, unauthenticated visitors on public marketing
 * pages before they ever sign up — there is no User row to attach it to.
 * This module is therefore a plain browser-storage state machine, not a
 * database write, and never touches ConsentRecord.
 *
 * ESSENTIAL technologies (auth/session cookies, locale preference) are not
 * modeled here at all — per FutureTutor's own Cookie Policy
 * (cookieContent.en.ts §26), they require no consent choice. Only the
 * ANALYTICS category is gated by this module today; a MARKETING category
 * is a possible future addition, not implemented here (no marketing
 * pixels exist to gate — see DATA-1's own out-of-scope list).
 */

export type ConsentCategory = "analytics";
export type ConsentDecision = "granted" | "denied";

export interface ConsentState {
  analytics: ConsentDecision | "undecided";
  /** The Cookie Policy version this decision was made against (cookieContent.*.ts's exported *_VERSION). Lets a future policy change invalidate a stale decision. */
  policyVersion: string | null;
  decidedAt: string | null;
}

export const CONSENT_STORAGE_KEY = "futuretutor_consent_v1";
/** Bump this if the consent model itself changes shape (not the legal policy text version, which is tracked per-decision in `policyVersion`). */
export const CONSENT_SCHEMA_VERSION = 1;

const DEFAULT_STATE: ConsentState = { analytics: "undecided", policyVersion: null, decidedAt: null };

function readStorage(): ConsentState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.analytics !== "granted" && parsed.analytics !== "denied" && parsed.analytics !== "undecided") {
      return DEFAULT_STATE;
    }
    return {
      analytics: parsed.analytics,
      policyVersion: typeof parsed.policyVersion === "string" ? parsed.policyVersion : null,
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : null,
    };
  } catch {
    // Private browsing / storage disabled / corrupted value — fail closed
    // to "undecided", never assume consent.
    return DEFAULT_STATE;
  }
}

function writeStorage(state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — the decision simply won't persist across
    // reloads; never throw out of a consent action.
  }
}

/** Default-deny: undecided or explicitly denied both return false. Never assume consent. */
export function hasAnalyticsConsent(): boolean {
  return readStorage().analytics === "granted";
}

export function getConsentState(): ConsentState {
  return readStorage();
}

function setDecision(decision: ConsentDecision, policyVersion: string): ConsentState {
  const next: ConsentState = { analytics: decision, policyVersion, decidedAt: new Date().toISOString() };
  writeStorage(next);
  return next;
}

/** Records an explicit "accept analytics" choice. Persistent, revocable. */
export function acceptAnalyticsConsent(policyVersion: string): ConsentState {
  return setDecision("granted", policyVersion);
}

/** Records an explicit "reject non-essential" choice. Persistent, revocable. */
export function rejectAnalyticsConsent(policyVersion: string): ConsentState {
  return setDecision("denied", policyVersion);
}

/** Returns to "undecided" — used by a "manage preferences" / revoke control. */
export function revokeAnalyticsConsent(): ConsentState {
  writeStorage(DEFAULT_STATE);
  return DEFAULT_STATE;
}
