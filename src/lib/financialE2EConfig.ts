import "server-only";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

/**
 * PROD-FINANCIAL-E2E1-GATE1 — a temporary, narrowly-scoped, fail-closed
 * exception to the Closed Beta financial gate (closedBetaFinancialGateActive(),
 * src/lib/closedBetaConfig.ts), which stays completely unmodified and
 * unweakened by this file. This is NOT a general allowlist: it recognizes
 * exactly one pre-defined scenario (one controlled customer, one controlled
 * tutor, one exact subject/level/mode/duration/price/payout combination),
 * and every dimension must match before the gate is bypassed for a single
 * request. It exists only to let one real, live financial round trip be
 * certified while the platform otherwise remains fully closed-beta-gated.
 *
 * Mirrors this codebase's established fail-closed single-purpose resolver
 * pattern (closedBetaConfig.ts, stripeConnectConfig.ts, paymentMode.ts): a
 * single authoritative, uncached function, re-validated on every call, that
 * defaults to the SAFE (restrictive) outcome for any absent/malformed input
 * — never a permissive default.
 *
 * Deliberately config-driven for the parts that identify a specific live
 * account (FINANCIAL_E2E_ACTOR_ID / FINANCIAL_E2E_TUTOR_PROFILE_ID) — no
 * real user/tutor identifier is ever hardcoded in source. The scenario
 * parameters themselves (subject/level/mode/duration/amounts) are NOT
 * account-identifying and are kept as named constants below, reviewable and
 * testable, rather than environment variables — there is nothing sensitive
 * about "this mission certifies a 60-minute Online Elementary Math booking."
 */

const AUTHORIZED_SUBJECT_SLUG = "math";
const AUTHORIZED_ACADEMIC_LEVEL_SLUG = "elementary";
const AUTHORIZED_MODE = "ONLINE" as const;
const AUTHORIZED_DURATION_MINUTES = 60;
const AUTHORIZED_CURRENCY = "CAD";
/** CAD 32.00 — must come from the normal pricing engine's own quote, never
 * asserted independently of it; this constant is only what we additionally
 * require that authoritative number to equal. */
const AUTHORIZED_CUSTOMER_AMOUNT_CENTS = 3200;
/** CAD 22.00 — same reasoning, for the tutor payout engine's own quote. */
const AUTHORIZED_TUTOR_PAYOUT_CENTS = 2200;

/** Zero I/O beyond process.env — the cheap pre-check every call site checks
 * FIRST, before ever calling auth() or touching the database. This is what
 * keeps this mechanism's existence a no-op (byte-identical call pattern to
 * before this mission) for every request while FINANCIAL_E2E_ENABLED is
 * absent — which is its state everywhere right now. Only the literal string
 * "true" enables it; anything else (unset, "false", "1", "yes", malformed)
 * is disabled, mirroring stripeConnectOnboardingAvailable()'s own
 * established convention in this codebase. */
export function financialE2EEnabled(): boolean {
  return process.env.FINANCIAL_E2E_ENABLED === "true";
}

function parseExpiresAt(): Date | null {
  const raw = process.env.FINANCIAL_E2E_EXPIRES_AT;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/** True only while the configured expiration is present, parseable, and
 * strictly in the future. An absent or malformed expiration is NEVER
 * treated as "no expiration" — it fails closed exactly like every other
 * missing/malformed condition here. Exported standalone so the expiration
 * behavior itself is directly unit-testable without exercising the full
 * scenario-match predicate. */
export function financialE2EWithinExpiration(now: Date = new Date()): boolean {
  const expiresAt = parseExpiresAt();
  if (!expiresAt) return false;
  return now.getTime() < expiresAt.getTime();
}

export interface FinancialE2EEligibilityParams {
  /** The authenticated actor's User.id, resolved by the caller from the
   * server-verified session — never a client-submitted value. */
  actorUserId: string;
  customerPriceQuoteId: string;
}

/**
 * The full, authoritative scenario check. Re-derives every dimension from
 * the database itself (the quote, its linked active TutorPayoutQuote, the
 * Subject/AcademicLevel slugs) — never trusts a client-supplied amount,
 * subject, level, mode, or duration. Returns false, safely, for any
 * malformed/missing/mismatched input; never throws for an ordinary
 * ineligible request (only a genuine unexpected DB error would propagate).
 *
 * Re-checks financialE2EEnabled() and the expiration internally too
 * (defense-in-depth, cheap) — a caller that skipped the fast pre-check for
 * any reason still gets the fail-closed answer, never a permissive one.
 */
export async function isFinancialE2EExceptionAllowed(params: FinancialE2EEligibilityParams): Promise<boolean> {
  if (!financialE2EEnabled()) return false;
  if (!financialE2EWithinExpiration()) return false;

  const configuredActorId = process.env.FINANCIAL_E2E_ACTOR_ID;
  const configuredTutorId = process.env.FINANCIAL_E2E_TUTOR_PROFILE_ID;
  if (!configuredActorId || !configuredTutorId) return false;

  if (params.actorUserId !== configuredActorId) return false;

  const quote = await db.customerPriceQuote.findUnique({
    where: { id: params.customerPriceQuoteId },
    select: {
      createdByUserId: true,
      subjectId: true,
      academicLevelId: true,
      tutoringMode: true,
      durationMinutes: true,
      totalCents: true,
      currency: true,
      status: true,
    },
  });
  if (!quote) return false;
  if (quote.createdByUserId !== params.actorUserId) return false;
  if (quote.status !== "ACTIVE") return false;
  if (quote.tutoringMode !== AUTHORIZED_MODE) return false;
  if (quote.durationMinutes !== AUTHORIZED_DURATION_MINUTES) return false;
  if (quote.currency !== AUTHORIZED_CURRENCY) return false;
  if (quote.totalCents !== AUTHORIZED_CUSTOMER_AMOUNT_CENTS) return false;

  const [subject, academicLevel] = await Promise.all([
    db.subject.findUnique({ where: { id: quote.subjectId }, select: { slug: true } }),
    quote.academicLevelId
      ? db.academicLevel.findUnique({ where: { id: quote.academicLevelId }, select: { slug: true } })
      : Promise.resolve(null),
  ]);
  if (subject?.slug !== AUTHORIZED_SUBJECT_SLUG) return false;
  if (academicLevel?.slug !== AUTHORIZED_ACADEMIC_LEVEL_SLUG) return false;

  const payoutQuote = await db.tutorPayoutQuote.findFirst({
    where: { customerPriceQuoteId: params.customerPriceQuoteId, status: "ACTIVE" },
    select: { tutorProfileId: true, totalPayoutCents: true, currency: true },
    orderBy: { createdAt: "desc" },
  });
  if (!payoutQuote) return false;
  if (payoutQuote.tutorProfileId !== configuredTutorId) return false;
  if (payoutQuote.currency !== AUTHORIZED_CURRENCY) return false;
  if (payoutQuote.totalPayoutCents !== AUTHORIZED_TUTOR_PAYOUT_CENTS) return false;

  // One-scenario boundary: while a Booking already exists for the
  // controlled tutor, the exception no longer applies. Today (Closed Beta
  // active, this mechanism the only way any Booking gets created at all)
  // this is equivalent to "the one authorized checkout already succeeded" —
  // a coarse, best-effort extra layer, NOT the primary duplicate-payment
  // guard. That guard remains the existing certified idempotency
  // (deterministic PaymentIntent/capture/transfer keys, the unique Payment-
  // per-quote row, hasOverlappingActiveBooking, Serializable transactions)
  // — unchanged and unweakened by this mission. A race between two
  // concurrent requests both observing "no Booking yet" is possible here,
  // exactly like every other read-then-act check in this codebase; the
  // existing guarded writes downstream are what actually prevent a
  // duplicate financial mutation, not this pre-check.
  const existingBooking = await db.booking.findFirst({
    where: { tutorProfileId: configuredTutorId },
    select: { id: true },
  });
  if (existingBooking) return false;

  return true;
}

/**
 * Fire only once a request has actually been let through by
 * isFinancialE2EExceptionAllowed — never speculatively. Reuses the existing
 * AuditLog mechanism (src/lib/audit.ts), no new logging framework. Logs
 * only internal identifiers, the scenario name, and a timestamp — never
 * card data, PaymentMethod details, bank information, Stripe secrets, or
 * unnecessary PII.
 */
export async function auditFinancialE2EExceptionUsed(params: {
  actorUserId: string;
  tutorProfileId: string;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: params.actorUserId,
    action: "financial_e2e_exception_used",
    entityType: "TutorProfile",
    entityId: params.tutorProfileId,
    metadata: {
      scenario: "ONLINE_MATH_ELEMENTARY_60MIN",
      mode: AUTHORIZED_MODE,
      subjectSlug: AUTHORIZED_SUBJECT_SLUG,
      academicLevelSlug: AUTHORIZED_ACADEMIC_LEVEL_SLUG,
      durationMinutes: AUTHORIZED_DURATION_MINUTES,
      customerAmountCents: AUTHORIZED_CUSTOMER_AMOUNT_CENTS,
      tutorPayoutCents: AUTHORIZED_TUTOR_PAYOUT_CENTS,
    },
  });
}
