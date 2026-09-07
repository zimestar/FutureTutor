import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";

// STUDENT-PARENT-DASHBOARD-UPCOMING1 — source-scan tests for the dashboard
// home page, mirroring this codebase's established convention for
// Server Component pages/components with no jsdom/RTL harness. Behavioral
// coverage of the actual query (status/endAt filter, ordering, bound) lives
// in dashboardUpcomingSessions.test.ts; this file verifies the PAGE wires
// the right authorization sources, translations, and CTAs, and never
// mutates anything.

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("dashboard/page.tsx — real Booking data, not a hardcoded empty state", () => {
  it("item 1 — the Schedule section is no longer permanently hardcoded empty: upcomingBookings is queried and conditionally rendered", () => {
    expect(source).toContain("resolveUpcomingBookings");
    expect(source).toMatch(/upcomingBookings\.length > 0 \?/);
  });

  it("item 2/24 — SELF-MANAGED STUDENT: bookings are scoped to the AUTHENTICATED user's own StudentProfile, never a client-supplied id", () => {
    expect(source).toMatch(/db\.studentProfile\.findUnique\(\{\s*where: \{ userId: user\.id \}/);
    expect(source).toContain("resolveUpcomingBookings([studentProfile.id])");
  });

  it("item 3/4/5 — GUARDIAN: bookings are scoped via listBookableStudentsForActor, the SAME authoritative helper /dashboard/bookings already uses (never a duplicated/looser authorization path)", () => {
    expect(source).toContain('import { listBookableStudentsForActor } from "@/services/learnerSelection";');
    expect(source).toContain("listBookableStudentsForActor(db, user.id)");
    expect(source).toContain("resolveUpcomingBookings(bookableChildren.map((child) => child.id))");
  });

  it("item 6 — never trusts a client-supplied studentProfileId/parentId/bookingId/tutorProfileId for discovery — every id feeding resolveUpcomingBookings is server-derived", () => {
    // The only two call sites are: the Student's own profile.id (looked up
    // by the authenticated userId above) and bookableChildren's ids
    // (already server-authorized) — never req/searchParams/formData.
    expect(sourceWithoutComments).not.toMatch(/searchParams|formData|req\.(query|body)/);
  });

  it("item 9/10 — next session ordering/definition is delegated entirely to resolveUpcomingBookings, never re-implemented inline (no duplicated status/endAt filter in the page itself)", () => {
    expect(sourceWithoutComments).not.toMatch(/status:\s*"CONFIRMED"/);
    expect(sourceWithoutComments).not.toMatch(/endAt:\s*\{\s*gte/);
  });

  it("item 11/12 — subject and tutor are rendered via existing translation helpers (subjects.items, dashboard.student.bookings.withTutor), never a raw slug/id", () => {
    expect(source).toContain('getTranslations({ locale, namespace: "subjects.items" })');
    expect(source).toContain('tBookings("withTutor"');
  });

  it("item 13 — student context is shown for the Parent branch only (forLearnerText), and is explicitly null (not shown) in the Student branch", () => {
    expect(source).toContain('tBookings("forLearner"');
    expect(source).toContain("forLearnerText={null}");
  });

  it("item 4 — multiple children: forLearnerText resolves the correct child name via a map keyed by studentProfileId, never merging different students", () => {
    expect(source).toContain("childNameById.get(booking.studentProfileId)");
  });

  it("item 14/15 — mode is rendered via the existing quickMatch.mode translation, covering both ONLINE and IN_PERSON without a new mode-label system", () => {
    expect(source).toContain('getTranslations({ locale, namespace: "quickMatch.mode" })');
    expect(source).toContain("tMode(booking.mode)");
  });

  it("item 16/17 — date/time is rendered via the existing formatBookingTime helper (booking.timezone, never a hardcoded zone, never raw UTC)", () => {
    expect(source).toContain('import { formatBookingTime } from "@/lib/utils";');
    expect(source).toContain("formatBookingTime(booking.startAt, booking.timezone, locale)");
    expect(sourceWithoutComments).not.toMatch(/America\/Edmonton|America\/Toronto|"UTC"/);
  });

  it("item 19/20 — the primary CTA links into the existing /session/[bookingId] route; no T-15/classroom-authorization logic is reproduced in this page", () => {
    expect(source).toContain("viewSessionHref={booking.hasSession ? `/session/${booking.id}` : null}");
    expect(sourceWithoutComments).not.toMatch(/checkInWindowOpensAt|graceDeadlineAt/);
  });

  it("messaging CTA routes through the existing /messages inbox — no new conversation-resolution Server Action introduced", () => {
    expect(source).toContain('messageTutorHref="/messages"');
    expect(sourceWithoutComments).not.toMatch(/ensureConversationAccess/);
  });

  it("item 18 — the empty state is still reachable (only rendered when the real query returns zero rows) — not deleted, just no longer unconditional", () => {
    expect(source).toContain('title={t("schedule.emptyTitle")}');
    expect(source).toContain('description={t("schedule.emptyDescription")}');
  });

  it("item 23 — no fixed pixel widths anywhere in the page", () => {
    expect(source).not.toMatch(/width:\s*\d+px/);
  });
});

describe("dashboard/page.tsx — no mutation of Booking/Session/Payment/Notification/Message state (items 24-30)", () => {
  it("no Booking/Session write", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.booking\.(create|update|updateMany|delete|upsert)/);
    expect(sourceWithoutComments).not.toMatch(/db\.session_\.(create|update|updateMany|delete|upsert)/i);
  });

  it("no notification write", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.notification\.(create|update|updateMany|delete|upsert)/);
    expect(sourceWithoutComments).not.toMatch(/notifyUser|emitSessionNotificationEvent/);
  });

  it("no messaging mutation — no sendMessage/Conversation write imported or called", () => {
    expect(sourceWithoutComments).not.toMatch(/sendMessage|ensureConversationAccess|db\.message\.|db\.conversation\./);
  });

  it("no Payment/TutorEarning/TutorTransfer mutation, no Stripe call", () => {
    expect(sourceWithoutComments).not.toMatch(/db\.payment\.(create|update|updateMany|delete|upsert)/);
    expect(sourceWithoutComments).not.toMatch(/db\.tutorEarning\.|db\.tutorTransfer\.|stripe\.|processEligibleTransfers/i);
  });

  it("no schema change was required — every field this page reads already exists on Booking/Session_/StudentProfile/TutorProfile", () => {
    // A pure documentation-enforcing assertion: this page only ever SELECTs
    // through resolveUpcomingBookings/listBookableStudentsForActor, both of
    // which read existing fields exclusively (verified in their own test
    // files) — this page itself contains no `prisma migrate` / schema text.
    expect(source).not.toMatch(/model \w+ \{|@@unique|@@index/);
  });
});

describe("dashboard/page.tsx — EN/FR translation coverage", () => {
  const REQUIRED_STUDENT_SCHEDULE_KEYS = ["title", "description", "viewCta", "emptyTitle", "emptyDescription", "nextSessionLabel", "messageTutorCta"];
  const REQUIRED_PARENT_SCHEDULE_KEYS = ["title", "description", "cta", "emptyTitle", "emptyDescription", "nextSessionLabel", "messageTutorCta"];

  for (const [locale, messages] of [
    ["en", en],
    ["fr", fr],
  ] as const) {
    it(`${locale} has every new dashboard.student.schedule key, non-empty`, () => {
      for (const key of REQUIRED_STUDENT_SCHEDULE_KEYS) {
        expect((messages.dashboard.student.schedule as Record<string, string>)[key], `missing ${locale} dashboard.student.schedule.${key}`).toBeTruthy();
      }
    });

    it(`${locale} has every new dashboard.parent.schedule key, non-empty`, () => {
      for (const key of REQUIRED_PARENT_SCHEDULE_KEYS) {
        expect((messages.dashboard.parent.schedule as Record<string, string>)[key], `missing ${locale} dashboard.parent.schedule.${key}`).toBeTruthy();
      }
    });

    it(`${locale} reuses the existing withTutor/forLearner/viewSession keys (no duplicated near-identical copy introduced)`, () => {
      expect(messages.dashboard.student.bookings.withTutor).toBeTruthy();
      expect(messages.dashboard.student.bookings.forLearner).toBeTruthy();
      expect(messages.sessionExperience.viewSession).toBeTruthy();
    });
  }
});
