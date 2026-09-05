import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";
import { Link } from "@/i18n/navigation";
import type { TutorEarningTransparency } from "@/lib/tutorEarningPresentation";

/**
 * TUTOR-PAYOUT-TRANSPARENCY1 — a single earning row on /tutor/payouts, with
 * a specific honest reason (never a generic unexplained "HELD" badge), a
 * clearly-labeled eligibility date (real vs. projected, never conflated),
 * a transfer date when one exists, and a link to the underlying session.
 * Server component, no interactivity — every string is resolved by the
 * caller so this stays a pure presentational shell.
 */
export function TutorEarningCard({
  amountLabel,
  subjectLabel,
  sessionDateLabel,
  bookingId,
  viewSessionLabel,
  reasonLabel,
  reasonDescription,
  badgeVariant,
  eligibilityDateLabel,
  transferDateLabel,
}: {
  amountLabel: string;
  subjectLabel: string;
  sessionDateLabel: string;
  bookingId: string | null;
  viewSessionLabel: string;
  reasonLabel: string;
  reasonDescription: string;
  badgeVariant: TutorEarningTransparency["badgeVariant"];
  eligibilityDateLabel: string | null;
  transferDateLabel: string | null;
}) {
  return (
    <Surface padding="sm" className="flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between" data-testid="tutor-earning-card">
      <div className="min-w-0">
        <p className="font-semibold text-navy">
          {subjectLabel} — {sessionDateLabel}
        </p>
        <p className="mt-1 text-base font-bold text-navy">{amountLabel}</p>
        {bookingId && (
          <Link href={`/session/${bookingId}`} className="mt-1 inline-block text-sm font-semibold text-blue hover:underline" data-testid="earning-session-link">
            {viewSessionLabel}
          </Link>
        )}
      </div>

      <div className="min-w-0 sm:max-w-sm">
        <Badge variant={badgeVariant}>{reasonLabel}</Badge>
        <p className="mt-2 text-sm text-text-secondary">{reasonDescription}</p>
        {eligibilityDateLabel && (
          <p className="mt-1 text-sm font-semibold text-navy" data-testid="eligibility-date">
            {eligibilityDateLabel}
          </p>
        )}
        {transferDateLabel && (
          <p className="mt-1 text-sm text-text-secondary" data-testid="transfer-date">
            {transferDateLabel}
          </p>
        )}
      </div>
    </Surface>
  );
}
