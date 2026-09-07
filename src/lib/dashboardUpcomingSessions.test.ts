import { beforeEach, describe, expect, it, vi } from "vitest";

// STUDENT-PARENT-DASHBOARD-UPCOMING1 — real behavioral coverage against a
// mocked Prisma client. This module is deliberately NOT an authorization
// function (see its own doc comment): it trusts studentProfileIds are
// already server-authorized by the caller. These tests therefore focus on
// its own actual job — the upcoming-booking definition (status/endAt
// filter, ordering, bound) and safe zero-id short-circuiting — while the
// dashboard page's own tests cover that the CALLER resolves those ids
// correctly (own profile for a Student, listBookableStudentsForActor for a
// Parent).

const mocks = vi.hoisted(() => ({
  bookingFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { booking: { findMany: mocks.bookingFindMany } },
}));

import { resolveUpcomingBookings } from "./dashboardUpcomingSessions";

const NOW = new Date("2026-09-05T00:00:00.000Z");

function bookingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "booking-1",
    startAt: new Date("2026-09-10T18:00:00.000Z"),
    endAt: new Date("2026-09-10T19:00:00.000Z"),
    timezone: "America/Edmonton",
    mode: "ONLINE",
    studentProfileId: "student-1",
    tutorProfile: { user: { name: "Matthew Allen" } },
    subject: { slug: "math" },
    session: { id: "session-1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bookingFindMany.mockResolvedValue([]);
});

describe("resolveUpcomingBookings", () => {
  it("an empty studentProfileIds array never touches the database", async () => {
    const result = await resolveUpcomingBookings([], NOW);
    expect(result).toEqual([]);
    expect(mocks.bookingFindMany).not.toHaveBeenCalled();
  });

  it("queries only CONFIRMED bookings whose endAt has not yet passed, ascending by startAt, bounded", async () => {
    await resolveUpcomingBookings(["student-1"], NOW);
    expect(mocks.bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentProfileId: { in: ["student-1"] }, status: "CONFIRMED", endAt: { gte: NOW } },
        orderBy: { startAt: "asc" },
        take: 3,
      })
    );
  });

  it("scopes to exactly the given studentProfileIds — never a wider query", async () => {
    await resolveUpcomingBookings(["student-1", "student-2"], NOW);
    expect(mocks.bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentProfileId: { in: ["student-1", "student-2"] } }) })
    );
  });

  it("maps a returned row to its normalized shape, including derived tutorFirstName and hasSession", async () => {
    mocks.bookingFindMany.mockResolvedValue([bookingRow()]);
    const result = await resolveUpcomingBookings(["student-1"], NOW);
    expect(result).toEqual([
      {
        id: "booking-1",
        startAt: new Date("2026-09-10T18:00:00.000Z"),
        endAt: new Date("2026-09-10T19:00:00.000Z"),
        timezone: "America/Edmonton",
        mode: "ONLINE",
        studentProfileId: "student-1",
        tutorFirstName: "Matthew",
        subjectSlug: "math",
        hasSession: true,
      },
    ]);
  });

  it("hasSession is false when a CONFIRMED booking has no linked Session_ row (defensive edge case)", async () => {
    mocks.bookingFindMany.mockResolvedValue([bookingRow({ session: null })]);
    const result = await resolveUpcomingBookings(["student-1"], NOW);
    expect(result[0]!.hasSession).toBe(false);
  });

  it("defaults `now` to the real current time when not supplied (so a fixed clock is a test-only override, not required for correctness)", async () => {
    await resolveUpcomingBookings(["student-1"]);
    const call = mocks.bookingFindMany.mock.calls[0]![0];
    expect(call.where.endAt.gte).toBeInstanceOf(Date);
  });
});
