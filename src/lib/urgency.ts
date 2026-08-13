/**
 * Shared urgency-band classification. Both pricing engines call this same
 * classifier but apply their own independently-configured dollar amount for
 * the resulting band — sharing "how urgent is this" is not the same as
 * sharing "how much does urgency cost," which must stay independent
 * (customer price vs. tutor payout are never derived from each other).
 */

export type UrgencyBand = "NORMAL" | "SHORT_NOTICE" | "URGENT";

export function getUrgencyBand(
  requestedStartAt: Date,
  now: Date,
  thresholds: { urgencyShortNoticeThresholdHours: number; urgencyUrgentThresholdHours: number }
): UrgencyBand {
  const hoursUntilStart = (requestedStartAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilStart < thresholds.urgencyUrgentThresholdHours) return "URGENT";
  if (hoursUntilStart < thresholds.urgencyShortNoticeThresholdHours) return "SHORT_NOTICE";
  return "NORMAL";
}
