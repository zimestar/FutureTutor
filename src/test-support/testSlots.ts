/**
 * RW-11 — a future 15:00 UTC start, `daysAhead` days out. Fixture tutors are
 * available 00:00-23:59 UTC, so a start derived from the current wall clock
 * made suites fail at certain hours (a 23:00 slot ends at 24:00, outside the
 * window). Vary `daysAhead` to get distinct, non-overlapping slots.
 */
export function futureSlotUtc(daysAhead: number): Date {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(15, 0, 0, 0);
  return start;
}
