/**
 * ADMIN-AUDITLOG-VIEWER1 — the small, closed set of entityTypes that
 * already have a real admin detail page today. Deliberately NOT
 * exhaustive (most entityTypes have no dedicated admin page at all) — an
 * unmapped entityType simply renders as plain text, never a broken link.
 * This never invents a new admin route; it only points at ones that
 * already exist and were audited in Phase 0.
 */
const ENTITY_DETAIL_HREF_BUILDERS: Partial<Record<string, (entityId: string) => string>> = {
  Booking: (id) => `/admin/bookings/${id}`,
  Session_: (id) => `/admin/sessions/${id}`,
  MessageReport: (id) => `/admin/message-reports/${id}`,
  TutorProfile: (id) => `/admin/tutors/${id}`,
  StudentProfile: (id) => `/admin/students/${id}`,
  ParentProfile: (id) => `/admin/parents/${id}`,
};

export function resolveAuditEntityDetailHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  const builder = ENTITY_DETAIL_HREF_BUILDERS[entityType];
  return builder ? builder(entityId) : null;
}
