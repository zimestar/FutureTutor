import { describe, it, expect } from "vitest";
import { buildSessionNotificationEmailContent, type SessionNotificationEmailContext } from "./sessionNotificationEmailContent";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// PROD-SESSION-NOTIFICATIONS1 — permanent unit tests for the session-
// lifecycle (reminder/cancellation/no-show) email content builder. Runs
// with no mocking at all (no next-intl/server, no next/headers anywhere
// in the call chain) — proves request-independence the same way
// bookingConfirmationEmailContent.test.ts / tutorApplicationEmailContent
// .test.ts do.

// The controlled production booking's exact instant: 2026-09-10 18:00-19:00
// America/Edmonton (UTC-6, no DST at this date) — chosen so Edmonton and
// UTC render VISIBLY different clock times, proving the formatter is
// actually timezone-aware.
const START_AT_UTC = new Date("2026-09-11T00:00:00.000Z");
const END_AT_UTC = new Date("2026-09-11T01:00:00.000Z");

function baseContext(overrides: Partial<SessionNotificationEmailContext> = {}): SessionNotificationEmailContext {
  return {
    locale: "en",
    recipientRole: "TUTOR",
    recipientFirstName: "Matthew",
    otherPartyFirstName: "Hamed",
    event: "SESSION_REMINDER_24H",
    subjectSlug: "math",
    academicLevelSlug: "elementary",
    mode: "ONLINE",
    startAt: START_AT_UTC,
    endAt: END_AT_UTC,
    timezone: "America/Edmonton",
    dashboardUrl: "https://www.futuretutor.ca/en/tutor/bookings",
    ...overrides,
  };
}

const ALL_EVENTS = [
  "SESSION_REMINDER_24H",
  "SESSION_REMINDER_2H",
  "SESSION_CANCELLED",
  "SESSION_NO_SHOW_TUTOR",
  "SESSION_NO_SHOW_LEARNER",
  "SESSION_NO_SHOW_UNRESOLVED",
] as const;

describe("buildSessionNotificationEmailContent", () => {
  it("EN request produces the real EN subject/heading from messages/en.json (tutor role)", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext());
    expect(content.subject).toBe(enMessages.sessionNotificationEmail.tutor.SESSION_REMINDER_24H.subject);
    expect(content.html).toContain(enMessages.sessionNotificationEmail.tutor.SESSION_REMINDER_24H.heading);
  });

  it("FR request produces the real FR copy, not EN", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ locale: "fr" }));
    expect(content.subject).toBe(frMessages.sessionNotificationEmail.tutor.SESSION_REMINDER_24H.subject);
    expect(content.subject).not.toBe(enMessages.sessionNotificationEmail.tutor.SESSION_REMINDER_24H.subject);
  });

  it("payer role uses the separate payer namespace, not the tutor one", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ recipientRole: "PAYER", otherPartyFirstName: "Matthew" }));
    expect(content.subject).toBe(enMessages.sessionNotificationEmail.payer.SESSION_REMINDER_24H.subject);
    expect(content.text).toContain("Matthew");
  });

  it("every event x role combination (12 total) produces real, distinct copy with no unresolved translation key", async () => {
    for (const event of ALL_EVENTS) {
      for (const recipientRole of ["TUTOR", "PAYER"] as const) {
        const content = await buildSessionNotificationEmailContent(
          baseContext({ event, recipientRole, cancelledByRelation: "OTHER_PARTY" })
        );
        const roleNs = recipientRole === "TUTOR" ? "tutor" : "payer";
        expect(content.subject).toBe(enMessages.sessionNotificationEmail[roleNs][event].subject);
        expect(content.html).not.toContain("sessionNotificationEmail.");
        expect(content.text).not.toContain("sessionNotificationEmail.");
      }
    }
  });

  it("timezone correctness — the controlled production booking renders as Sep 10, 6:00-7:00 PM America/Edmonton, never UTC midnight", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext());
    expect(content.text).toContain("6:00");
    expect(content.text).toContain("7:00");
    expect(content.text).toContain("America/Edmonton");
    expect(content.text).not.toMatch(/\b12:00 AM\b/);
  });

  it("CTA uses the passed-in dashboardUrl and never a localhost origin", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ dashboardUrl: "https://www.futuretutor.ca/en/tutor/bookings" }));
    expect(content.html).toContain(`<a href="https://www.futuretutor.ca/en/tutor/bookings"`);
    expect(content.html).not.toContain("localhost");
    expect(content.text).not.toContain("localhost");
  });

  it("includes an online-classroom note for ONLINE reminders and omits it for IN_PERSON", async () => {
    const online = await buildSessionNotificationEmailContent(baseContext({ mode: "ONLINE" }));
    expect(online.text).toContain(enMessages.sessionNotificationEmail.onlineNote);

    const inPerson = await buildSessionNotificationEmailContent(baseContext({ mode: "IN_PERSON" }));
    expect(inPerson.text).not.toContain(enMessages.sessionNotificationEmail.onlineNote);
  });

  it("IN_PERSON privacy — never renders a street address, only the mode label (matches the existing booking-confirmation email's own precedent)", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ mode: "IN_PERSON" }));
    const serialized = `${content.subject}\n${content.html}\n${content.text}`;
    expect(serialized).not.toMatch(/\d{1,5}\s+\w+\s+(street|st\.|avenue|ave\.|road|rd\.)/i);
    expect(serialized).toContain(enMessages.sessionNotificationEmail.modeInPerson);
  });

  it("cancellation: 'other party cancelled' copy never claims a refund has occurred", async () => {
    const content = await buildSessionNotificationEmailContent(
      baseContext({ event: "SESSION_CANCELLED", cancelledByRelation: "OTHER_PARTY" })
    );
    expect(content.text).toContain(enMessages.sessionNotificationEmail.cancelledByOtherPartyLabel);
    expect(content.text).toContain(enMessages.sessionNotificationEmail.adjustmentNote);
    expect(content.text.toLowerCase()).not.toContain("you have been refunded");
    expect(content.text.toLowerCase()).not.toContain("refund issued");
  });

  it("cancellation: platform (admin) cancellation uses distinct copy from a same-side cancellation", async () => {
    const platformContent = await buildSessionNotificationEmailContent(
      baseContext({ event: "SESSION_CANCELLED", cancelledByRelation: "PLATFORM" })
    );
    expect(platformContent.text).toContain(enMessages.sessionNotificationEmail.cancelledByPlatformLabel);
    expect(platformContent.text).not.toContain(enMessages.sessionNotificationEmail.cancelledByOtherPartyLabel);
  });

  it("no-show: tutor recipient told THEY didn't show vs told the learner didn't show — distinct copy", async () => {
    const tutorNoShow = await buildSessionNotificationEmailContent(baseContext({ event: "SESSION_NO_SHOW_TUTOR", recipientRole: "TUTOR" }));
    const learnerNoShow = await buildSessionNotificationEmailContent(baseContext({ event: "SESSION_NO_SHOW_LEARNER", recipientRole: "TUTOR" }));
    expect(tutorNoShow.subject).not.toBe(learnerNoShow.subject);
  });

  it("escapes HTML-significant characters in interpolated names", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ otherPartyFirstName: "<script>alert(1)</script>" }));
    expect(content.html).not.toContain("<script>alert(1)</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("never includes card/bank details anywhere", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ event: "SESSION_CANCELLED", cancelledByRelation: "OTHER_PARTY" }));
    const serialized = `${content.subject}\n${content.html}\n${content.text}`;
    expect(serialized.toLowerCase()).not.toContain("card");
    expect(serialized.toLowerCase()).not.toContain("bank");
  });

  it("missing locale falls back to the documented default (en)", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ locale: "" }));
    expect(content.subject).toBe(enMessages.sessionNotificationEmail.tutor.SESSION_REMINDER_24H.subject);
  });

  it("unsupported locale falls back to the documented default (en)", async () => {
    const content = await buildSessionNotificationEmailContent(baseContext({ locale: "de" }));
    expect(content.subject).toBe(enMessages.sessionNotificationEmail.tutor.SESSION_REMINDER_24H.subject);
  });
});
