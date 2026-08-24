import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = ["students/page.tsx", "students/[id]/page.tsx", "bookings/page.tsx", "bookings/[bookingId]/page.tsx", "sessions/page.tsx", "sessions/[sessionId]/page.tsx", "users/page.tsx"];

describe("Admin Beta operational route contracts", () => {
  it.each(routes)("keeps %s behind a server-side Admin role gate", (route) => {
    const source = readFileSync(`src/app/[locale]/admin/${route}`, "utf8");
    expect(source).toContain("await auth()");
    expect(source).toContain('"ADMIN"');
    expect(source).toContain('"SUPER_ADMIN"');
    expect(source).toContain('redirect({ href: "/login", locale })');
  });
  it("exposes every completed domain through the Admin navigation", () => {
    const nav = readFileSync("src/lib/adminNav.ts", "utf8");
    for (const path of ["/admin/students", "/admin/bookings", "/admin/sessions", "/admin/users"]) expect(nav).toContain(path);
  });
  it("keeps Users and operational pages read-only", () => {
    for (const route of routes) {
      const source = readFileSync(`src/app/[locale]/admin/${route}`, "utf8");
      expect(source).not.toMatch(/passwordHash|VerificationToken|stripeSecret|meetingToken/);
      expect(source).not.toMatch(/\.update\(|\.delete\(|\.create\(/);
    }
  });
  it("routes operational details only to Admin-owned pages, never the participant classroom", () => {
    const bookings = readFileSync("src/app/[locale]/admin/bookings/page.tsx", "utf8");
    const sessions = readFileSync("src/app/[locale]/admin/sessions/page.tsx", "utf8");
    expect(bookings).toContain("/admin/bookings/${b.id}");
    expect(sessions).toContain("/admin/sessions/${s.id}");
    expect(`${bookings}${sessions}`).not.toMatch(/href=\{`\/session\//);
  });
  it("allows only ADMIN and SUPER_ADMIN at the server gate", () => {
    for (const route of routes) {
      const source = readFileSync(`src/app/[locale]/admin/${route}`, "utf8");
      expect(source).toMatch(/\["ADMIN",\s*"SUPER_ADMIN"\]\.includes\((?:user|actor)\.role\)/);
    }
  });
});

describe("Tutor photo surface coverage", () => {
  it("renders the upload component on the Tutor Profile", () => expect(readFileSync("src/app/[locale]/tutor/profile/page.tsx", "utf8")).toContain("<TutorProfileImageForm"));
  it.each([
    "src/app/[locale]/tutors/[slug]/page.tsx",
    "src/components/marketing/TutorCard.tsx",
    "src/app/[locale]/admin/tutors/page.tsx",
    "src/app/[locale]/admin/tutors/[id]/page.tsx",
    "src/components/dashboard/DashboardShell.tsx",
  ])("renders the shared initials-safe Avatar on %s", (file) => expect(readFileSync(file, "utf8")).toContain("<Avatar"));
});
