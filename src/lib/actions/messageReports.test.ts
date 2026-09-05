import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createMessageReport: vi.fn(),
  updateMessageReportStatus: vi.fn(),
  hasAdminPermission: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/services/messageReports", () => ({
  createMessageReport: mocks.createMessageReport,
  updateMessageReportStatus: mocks.updateMessageReportStatus,
}));
vi.mock("@/lib/adminPermission", () => ({ hasAdminPermission: mocks.hasAdminPermission }));

import { reportMessageAction, updateMessageReportStatusAction } from "./messageReports";

const USER_ID = "user-1";
const ADMIN_ID = "admin-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID, role: "STUDENT" } });
  mocks.createMessageReport.mockResolvedValue({ ok: true, reportId: "report-1", alreadyReported: false });
  mocks.hasAdminPermission.mockResolvedValue(true);
  mocks.updateMessageReportStatus.mockResolvedValue({ ok: true });
});

describe("reportMessageAction", () => {
  it("item 21 — reporterUserId is always resolved from auth(), never accepted as a parameter", async () => {
    await reportMessageAction("msg-1", "SPAM");
    expect(mocks.createMessageReport).toHaveBeenCalledWith(USER_ID, { messageId: "msg-1", reason: "SPAM", detail: undefined });
  });

  it("an unauthenticated caller cannot report", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await reportMessageAction("msg-1", "SPAM");
    expect(result).toEqual({ ok: false, reason: "UNAUTHENTICATED" });
    expect(mocks.createMessageReport).not.toHaveBeenCalled();
  });

  it("passes through the domain service's own result reason on failure", async () => {
    mocks.createMessageReport.mockResolvedValue({ ok: false, reason: "SELF_REPORT" });
    const result = await reportMessageAction("msg-1", "SPAM");
    expect(result).toEqual({ ok: false, reason: "SELF_REPORT" });
  });
});

describe("updateMessageReportStatusAction (admin)", () => {
  it("item 32 — an authorized admin can transition a report", async () => {
    mocks.auth.mockResolvedValue({ user: { id: ADMIN_ID, role: "ADMIN" } });
    const result = await updateMessageReportStatusAction("report-1", "UNDER_REVIEW");
    expect(result).toEqual({ ok: true });
    expect(mocks.hasAdminPermission).toHaveBeenCalledWith(expect.objectContaining({ id: ADMIN_ID }), "ADMIN_MESSAGE_REPORTS_MANAGE");
  });

  it("item 33 — an admin missing the MANAGE permission is denied, even though authenticated", async () => {
    mocks.auth.mockResolvedValue({ user: { id: ADMIN_ID, role: "ADMIN" } });
    mocks.hasAdminPermission.mockResolvedValue(false);
    const result = await updateMessageReportStatusAction("report-1", "RESOLVED");
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.updateMessageReportStatus).not.toHaveBeenCalled();
  });

  it("item 34 — a PARENT is denied", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "parent-1", role: "PARENT" } });
    mocks.hasAdminPermission.mockResolvedValue(false);
    const result = await updateMessageReportStatusAction("report-1", "RESOLVED");
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
  });

  it("item 35 — a STUDENT is denied", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    mocks.hasAdminPermission.mockResolvedValue(false);
    const result = await updateMessageReportStatusAction("report-1", "RESOLVED");
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
  });

  it("item 36 — a TUTOR is denied", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "tutor-1", role: "TUTOR" } });
    mocks.hasAdminPermission.mockResolvedValue(false);
    const result = await updateMessageReportStatusAction("report-1", "RESOLVED");
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
  });

  it("an unauthenticated caller is denied", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await updateMessageReportStatusAction("report-1", "RESOLVED");
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });
    expect(mocks.hasAdminPermission).not.toHaveBeenCalled();
  });
});
