/**
 * ADMIN-AUDITLOG-VIEWER1 — pure, dependency-free presentation helpers for
 * the AuditLog viewer. Two concerns, deliberately kept separate:
 *
 * 1. Display-only action grouping (AUDIT_ACTION_CATEGORIES /
 *    resolveAuditActionCategory) — never alters what's stored. Built from a
 *    real inventory of every `action: "..."` literal this codebase's
 *    writeAuditLog callers actually emit today (grepped, not invented) plus
 *    the one dynamic value (`quickmatch.request.${suffix}`,
 *    quickMatchDispatch.ts) expanded to its three concrete outcomes. A
 *    future action this list doesn't yet know about safely falls into
 *    "OTHER" rather than throwing or being hidden.
 *
 * 2. Safe metadata rendering (redactAuditMetadata) — AuditLog.metadata is an
 *    untyped Json? column written by ~25 different call sites across the
 *    codebase; this function is the one place that decides what's safe to
 *    show an admin. Bounded (key count, value length, nesting depth) and
 *    redacts by KEY PATTERN rather than trying to enumerate every safe key
 *    per action (which would be a large, constantly-stale allowlist given
 *    how many action types exist) — the observed metadata across every
 *    current writer is plain identifiers/amounts/statuses/reasons, and
 *    nothing resembling a secret was found in this codebase's actual
 *    writers, but "never assume all historical metadata is safe" (mission
 *    instruction) means the redaction is a structural guarantee, not a
 *    one-time audit of today's call sites.
 */

export type AuditActionCategory = "AUTH_USER" | "TUTOR_APPLICATION" | "BOOKING_SESSION" | "FINANCIAL" | "MESSAGING_SAFETY" | "ADMIN" | "OTHER";

export const AUDIT_ACTION_CATEGORIES: Record<Exclude<AuditActionCategory, "OTHER">, readonly string[]> = {
  AUTH_USER: [
    "login",
    "register",
    "resetPassword",
    "forgotPassword",
    "verifyEmail",
    "emailVerificationResend",
    "invitationClaim",
    "adminSetup",
    "email_verification.completed",
    "email_verification.invalid_or_expired",
    "email_verification.requested",
    "password_reset.completed",
    "password_reset.invalid_or_expired",
    "password_reset.requested",
    "family.guardian.invitation.approved",
    "family.guardian.invitation.claimed",
    "family.guardian.invitation.created",
    "family.guardian.invitation.superseded",
    "family.guardian.relationship.revoked",
    "family.student.created",
    "family.studentLogin.activated",
    "family.studentLogin.invitation.claimed",
    "family.studentLogin.invitation.created",
    "family.studentLogin.invitation.superseded",
    "profile.parent.updated",
    "profile.student.updated",
    "student.reactivated",
    "student.suspended",
    "parent.suspended",
    "parent.reactivated",
  ],
  TUTOR_APPLICATION: [
    "tutor.application.submitted",
    "tutor.approved",
    "tutor.certification.verified",
    "tutor.document.approved",
    "tutor.document.rejected",
    "tutor.document.replacementRequested",
    "tutor.documentReview.started",
    "tutor.education.verified",
    "tutor.exam.attemptRecorded",
    "tutor.exam.stageCompleted",
    "tutor.examStage.entered",
    "tutor.interview.completed",
    "tutor.interview.evaluationRecorded",
    "tutor.interview.scheduled",
    "tutor.interviewStage.entered",
    "tutor.payoutTier.changed",
    "tutor.reactivated",
    "tutor.rejected",
    "tutor.sentToFinalReview",
    "tutor.suspended",
    "tutor.training.completed",
    "tutor.training.moduleCompleted",
    "tutor.trainingStage.entered",
  ],
  BOOKING_SESSION: [
    "booking.cancelled_by_admin",
    "booking.cancelled_by_customer",
    "booking.cancelled_by_tutor",
    "quickmatch.invitation.accepted",
    "quickmatch.invitation.declined",
    "quickmatch.invitation.dispatched",
    "quickmatch.request.cancelled",
    "quickmatch.request.confirmed",
    "quickmatch.request.created",
    "quickmatch.request.noTutorFound",
    "quickmatch.request.failed",
    "quickmatch.settings.updated",
    "video_session.access_revoked_on_cancellation",
    "video_session.daily_webhook_participant_joined",
    "video_session.room_provisioned",
    "video_session.stale_claim_reclaimed",
    "video_session.stale_provider_room_reclaimed",
  ],
  FINANCIAL: [
    "financial_e2e_exception_used",
    "payment.admin_reconcile_triggered",
    "payment.authorization_released",
    "payment.balance_transaction_conflict",
    "payment.capture_failed",
    "payment.captured",
    "payment.charge_id_conflict",
    "payment.no_refund_recorded",
    "payment.reconciliation_stuck",
    "payment.refund_ledger_state_conflict",
    "payment.refunded",
    "pricing.baseRule.created",
    "pricing.baseRule.superseded",
    "pricing.baseRule.updated",
    "pricing.payoutRule.created",
    "pricing.payoutRule.superseded",
    "pricing.payoutRule.updated",
    "pricing.settings.updated",
    "refund.discovery_mismatch",
    "refund.discovery_multiple_candidates",
    "refund.failed_requires_recovery",
    "refund.obligation_outstanding",
    "refund.obligation_reopened",
    "refund.recovery_attempt_started",
    "refund.recovery_create_rejected",
    "refund.stale_webhook_ignored",
    "refund.succeeded_then_failed",
    "refund.tier7_reverify_error",
    "stripe.dispute.closed",
    "stripe.dispute.created",
    "tutor_earning.cancelled",
    "tutor_earning.created",
    "tutor_earning.reconciliation_required_inconsistent_facts",
    "tutor_earning.transferred_exposure_at_cancellation",
    "tutor_transfer.completed",
    "tutor_transfer.failed",
  ],
  MESSAGING_SAFETY: ["message_report.created", "message_report.status_changed", "admin.conversation_viewed"],
  ADMIN: [
    "admin.invitation_accepted",
    "admin.invitation_created",
    "admin.invitation_resent",
    "admin.invitation_revoked",
    "admin.permissions_updated",
    "admin.promoted_to_super_admin",
    "admin.reactivated",
    "admin.suspended",
  ],
} as const;

const ACTION_TO_CATEGORY: ReadonlyMap<string, Exclude<AuditActionCategory, "OTHER">> = new Map(
  (Object.entries(AUDIT_ACTION_CATEGORIES) as Array<[Exclude<AuditActionCategory, "OTHER">, readonly string[]]>).flatMap(([category, actions]) =>
    actions.map((action) => [action, category] as const)
  )
);

/** Every known action value, for building a filter dropdown — grouped, but
 * the raw stored strings themselves, never translated/altered. */
export const ALL_KNOWN_AUDIT_ACTIONS: readonly string[] = Array.from(ACTION_TO_CATEGORY.keys()).sort();

export function resolveAuditActionCategory(action: string): AuditActionCategory {
  return ACTION_TO_CATEGORY.get(action) ?? "OTHER";
}

// ---------------------------------------------------------------------------
// Safe metadata rendering
// ---------------------------------------------------------------------------

/** Key-name substrings that always redact a metadata field's VALUE,
 * regardless of action or historical origin — matched case-insensitively
 * against the key alone, never the value (a value is never inspected to
 * decide safety, since a legitimate identifier can coincidentally look like
 * a random string). Includes both real-secret shapes (token/secret/
 * password/credential/apikey/signature/privateKey) and, per this mission's
 * explicit "no private message content" instruction, anything that could
 * carry free-form message content (body/content/text/message) even though
 * no current writer stores that under AuditLog.metadata — a future/legacy
 * entry is never trusted blindly. */
const REDACTED_METADATA_KEY_PATTERN = /token|secret|password|credential|api[-_]?key|signature|private[-_]?key|^body$|^content$|^text$|^message$/i;

const MAX_METADATA_KEYS = 20;
const MAX_METADATA_VALUE_LENGTH = 300;

export interface SafeMetadataField {
  key: string;
  /** Already a display-ready string — "[redacted]" for a matched key,
   * "[object]"/"[array]" for anything nested beyond a shallow scalar,
   * length-capped otherwise. Never the raw, unbounded value. */
  value: string;
  redacted: boolean;
}

function stringifyScalar(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return value.length > MAX_METADATA_VALUE_LENGTH ? `${value.slice(0, MAX_METADATA_VALUE_LENGTH)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "[object]";
}

/**
 * Renders AuditLog.metadata as a bounded, redacted list of key/value pairs
 * — never a raw JSON.stringify dump. Safe for `null`/`undefined`/a
 * non-object value (defensive: the column is nullable Json, and nothing
 * guarantees a legacy or future row is a plain object).
 */
export function redactAuditMetadata(metadata: unknown): SafeMetadataField[] {
  if (metadata === null || metadata === undefined || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  const entries = Object.entries(metadata as Record<string, unknown>).slice(0, MAX_METADATA_KEYS);
  return entries.map(([key, value]) => {
    const redacted = REDACTED_METADATA_KEY_PATTERN.test(key);
    if (redacted) return { key, value: "[redacted]", redacted: true };
    if (value !== null && typeof value === "object") {
      return { key, value: Array.isArray(value) ? "[array]" : "[object]", redacted: false };
    }
    return { key, value: stringifyScalar(value), redacted: false };
  });
}
