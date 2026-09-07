import { describe, expect, it } from "vitest";
import { resolveAuditEntityDetailHref } from "./auditLogEntityLinks";

describe("resolveAuditEntityDetailHref", () => {
  it("builds a real admin detail link for a known, existing entityType", () => {
    expect(resolveAuditEntityDetailHref("Booking", "booking-1")).toBe("/admin/bookings/booking-1");
    expect(resolveAuditEntityDetailHref("MessageReport", "report-1")).toBe("/admin/message-reports/report-1");
    expect(resolveAuditEntityDetailHref("TutorProfile", "tutor-1")).toBe("/admin/tutors/tutor-1");
    expect(resolveAuditEntityDetailHref("StudentProfile", "student-1")).toBe("/admin/students/student-1");
    expect(resolveAuditEntityDetailHref("ParentProfile", "parent-1")).toBe("/admin/parents/parent-1");
    expect(resolveAuditEntityDetailHref("Session_", "session-1")).toBe("/admin/sessions/session-1");
  });

  it("returns null (never a broken/invented link) for an entityType with no admin detail page", () => {
    expect(resolveAuditEntityDetailHref("Payment", "payment-1")).toBeNull();
    expect(resolveAuditEntityDetailHref("TutorEarning", "earning-1")).toBeNull();
    expect(resolveAuditEntityDetailHref("SomeFutureEntityType", "x")).toBeNull();
  });

  it("returns null when entityId is null, even for a known entityType", () => {
    expect(resolveAuditEntityDetailHref("Booking", null)).toBeNull();
  });
});
