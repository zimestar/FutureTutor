import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { Link } from "@/i18n/navigation";
import type { AdminEarningReasonKey } from "@/lib/adminFinancialOpsPresentation";

/**
 * ADMIN-FINANCIAL-OPS1A — one TutorEarning row on /admin/financial-ops.
 * Pure presentational shell, no interactivity, no financial action of any
 * kind — every string/link target is resolved by the caller.
 */
const REASON_BADGE_VARIANT: Record<AdminEarningReasonKey, "mint" | "blue" | "neutral" | "outline"> = {
  pendingSessionOutcome: "neutral",
  waiting24h: "blue",
  awaitingConvergence: "outline",
  eligible: "blue",
  heldTutorNoShow: "outline",
  heldNoShowUnresolved: "outline",
  heldInterrupted: "outline",
  heldUnknown: "outline",
  transferPending: "blue",
  transferred: "mint",
  transferFailed: "outline",
  cancelled: "neutral",
};

export function AdminEarningRow({
  tutorName,
  amountLabel,
  subjectLabel,
  sessionDateLabel,
  sessionOutcomeLabel,
  reasonKey,
  reasonLabel,
  reasonDescription,
  delayAnchorLabel,
  eligibilityFieldLabel,
  eligibilityDateLabel,
  transferFieldLabel,
  transferStatusLabel,
  transferReference,
  bookingId,
  viewBookingLabel,
  tutorProfileId,
  viewTutorLabel,
}: {
  tutorName: string;
  amountLabel: string;
  subjectLabel: string;
  sessionDateLabel: string;
  sessionOutcomeLabel: string;
  reasonKey: AdminEarningReasonKey;
  reasonLabel: string;
  reasonDescription: string;
  delayAnchorLabel: string;
  eligibilityFieldLabel: string;
  eligibilityDateLabel: string;
  transferFieldLabel: string;
  transferStatusLabel: string;
  transferReference: string | null;
  bookingId: string;
  viewBookingLabel: string;
  tutorProfileId: string;
  viewTutorLabel: string;
}) {
  return (
    <Surface padding="sm" className="flex flex-col gap-3 text-sm" data-testid="admin-earning-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-extrabold text-navy">{tutorName}</p>
          <p className="mt-1 text-text-secondary">
            {subjectLabel} — {sessionDateLabel}
          </p>
          <p className="mt-1 text-xs text-text-muted">{sessionOutcomeLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold text-navy">{amountLabel}</p>
          <div className="mt-1">
            <Badge variant={REASON_BADGE_VARIANT[reasonKey]}>{reasonLabel}</Badge>
          </div>
        </div>
      </div>

      <p className="text-text-secondary">{reasonDescription}</p>

      <dl className="grid grid-cols-1 gap-2 text-xs text-text-muted sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="font-semibold">{delayAnchorLabel}</dt>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold">{eligibilityFieldLabel}</dt>
          <dd data-testid="eligibility-field">{eligibilityDateLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-semibold">{transferFieldLabel}</dt>
          <dd data-testid="transfer-field">
            {transferStatusLabel}
            {transferReference && <span> · {transferReference}</span>}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-4 border-t border-border pt-2">
        <Link href={`/admin/bookings/${bookingId}`} className="text-sm font-semibold text-blue hover:underline" data-testid="view-booking-link">
          {viewBookingLabel}
        </Link>
        <Link href={`/admin/tutors/${tutorProfileId}`} className="text-sm font-semibold text-blue hover:underline" data-testid="view-tutor-link">
          {viewTutorLabel}
        </Link>
      </div>
    </Surface>
  );
}
