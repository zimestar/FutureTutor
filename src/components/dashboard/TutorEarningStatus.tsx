import { Badge } from "@/components/ui/Badge";
import type { TutorEarningPresentation } from "@/lib/tutorEarningPresentation";

export function TutorEarningStatus({
  presentation,
  label,
  description,
  eligibilityDateLabel,
  compact = false,
}: {
  presentation: TutorEarningPresentation;
  label: string;
  description: string;
  eligibilityDateLabel?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="earning-presentation">
        <span>{label}</span>
        {presentation.showEligibilityDate && eligibilityDateLabel && (
          <span className="font-normal text-text-secondary">{eligibilityDateLabel}</span>
        )}
      </span>
    );
  }

  return (
    <div className="min-w-0 sm:max-w-sm" data-testid="earning-presentation">
      <Badge variant={presentation.badgeVariant}>{label}</Badge>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
      {presentation.showEligibilityDate && eligibilityDateLabel && (
        <p className="mt-1 text-sm font-semibold text-navy">{eligibilityDateLabel}</p>
      )}
    </div>
  );
}
