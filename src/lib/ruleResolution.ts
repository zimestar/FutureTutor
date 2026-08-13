/**
 * Shared 3-tier rule-priority resolution used by both the customer pricing
 * and tutor payout engines: (1) exact subject + exact level, (2) exact
 * subject + wildcard level, (3) platform-wide wildcard. A 4th "wildcard
 * subject + exact level" tier is deliberately unsupported — rejected at
 * rule-creation time instead of silently never being selected.
 */

export interface ScopedRule {
  subjectId: string | null;
  academicLevelId: string | null;
}

export function pickHighestPriorityRule<T extends ScopedRule>(
  candidates: T[],
  subjectId: string,
  academicLevelId: string | null
): T | null {
  const priority = (rule: ScopedRule): number => {
    if (rule.subjectId === subjectId && rule.academicLevelId === academicLevelId) return 3;
    if (rule.subjectId === subjectId && rule.academicLevelId === null) return 2;
    if (rule.subjectId === null && rule.academicLevelId === null) return 1;
    return 0;
  };

  let best: T | null = null;
  let bestScore = 0;
  for (const rule of candidates) {
    const score = priority(rule);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}
