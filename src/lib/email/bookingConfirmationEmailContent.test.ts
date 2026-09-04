import { describe, it, expect } from "vitest";

// PROD-BOOKING-NOTIFICATIONS1 — permanent unit tests for the locale-aware
// tutor/payer booking-confirmation email copy.
//
// PROD-BOOKING-NOTIFICATIONS1-I18NFIX1: no next-intl/server mock is needed
// any more. The production code now goes through emailTranslation.ts's
// createEmailTranslator (use-intl/core's createTranslator, built directly
// from the real messages/en.json + messages/fr.json) instead of
// next-intl/server's getTranslations — a pure function with no next/headers
// dependency, so it runs for real under vitest exactly like it runs in a
// background job, with no fake/mocked translator standing in for it.

import { buildTutorBookingEmailContent, buildPayerBookingEmailContent, type BookingEmailContext } from "./bookingConfirmationEmailContent";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// A fixed UTC instant chosen so that America/Edmonton (UTC-6, no DST at
// this date) and UTC render VISIBLY different clock times — this is what
// proves the formatter is actually timezone-aware, not silently showing
// UTC (test matrix item 8 / the mission's own explicit warning about the
// first controlled attempt's timezone requirement).
const START_AT_UTC = new Date("2026-09-11T00:00:00.000Z"); // = 2026-09-10 18:00 America/Edmonton
const END_AT_UTC = new Date("2026-09-11T01:00:00.000Z"); // = 2026-09-10 19:00 America/Edmonton

function baseContext(overrides: Partial<BookingEmailContext> = {}): BookingEmailContext {
  return {
    locale: "en",
    tutorFirstName: "Matthew",
    learnerFirstName: "Hamed",
    payerFirstName: "Hamed",
    payerIsLearner: true,
    subjectSlug: "math",
    academicLevelSlug: "elementary",
    mode: "ONLINE",
    startAt: START_AT_UTC,
    endAt: END_AT_UTC,
    timezone: "America/Edmonton",
    amountCents: 3200,
    currency: "CAD",
    bookingUrl: "https://futuretutor.ca/en/dashboard/bookings",
    ...overrides,
  };
}

describe("buildTutorBookingEmailContent", () => {
  it("EN request produces the real EN subject/copy from messages/en.json", async () => {
    const content = await buildTutorBookingEmailContent(baseContext());
    expect(content.subject).toBe(enMessages.tutorBookingEmail.subject);
    expect(content.html).toContain(enMessages.tutorBookingEmail.heading);
  });

  it("FR request produces the real FR subject/copy, not EN", async () => {
    const content = await buildTutorBookingEmailContent(baseContext({ locale: "fr" }));
    expect(content.subject).toBe(frMessages.tutorBookingEmail.subject);
    expect(content.subject).not.toBe(enMessages.tutorBookingEmail.subject);
  });

  it("includes the translated subject/level names, never the raw slug", async () => {
    const content = await buildTutorBookingEmailContent(baseContext());
    expect(content.text).toContain("Mathematics");
    expect(content.text).toContain("Elementary");
    expect(content.text).not.toContain("math\n");
  });

  it("formats the session time in the booking's own timezone, never UTC", async () => {
    const content = await buildTutorBookingEmailContent(baseContext());
    expect(content.text).toContain("6:00");
    expect(content.text).toContain("7:00");
    expect(content.text).toContain("America/Edmonton");
    // The UTC hour (00:00/01:00) must never leak into the rendered copy.
    expect(content.text).not.toMatch(/\b12:00 AM\b/);
  });

  it("includes an online-classroom note for ONLINE sessions and omits it for IN_PERSON", async () => {
    const online = await buildTutorBookingEmailContent(baseContext({ mode: "ONLINE" }));
    expect(online.text).toContain(enMessages.tutorBookingEmail.onlineNote);

    const inPerson = await buildTutorBookingEmailContent(baseContext({ mode: "IN_PERSON" }));
    expect(inPerson.text).not.toContain(enMessages.tutorBookingEmail.onlineNote);
    expect(inPerson.text).toContain(enMessages.tutorBookingEmail.modeInPerson);
  });

  it("includes the learner's first name so the tutor knows who booked", async () => {
    const content = await buildTutorBookingEmailContent(baseContext({ learnerFirstName: "Hamed" }));
    expect(content.text).toContain("Hamed");
  });

  it("never includes the customer's payment amount or any card/payout detail", async () => {
    const content = await buildTutorBookingEmailContent(baseContext());
    const serialized = `${content.subject}\n${content.html}\n${content.text}`;
    expect(serialized).not.toContain("32.00");
    expect(serialized.toLowerCase()).not.toContain("card");
    expect(serialized.toLowerCase()).not.toContain("payout");
  });

  it("html includes a clickable link to the tutor bookings CTA", async () => {
    const url = "https://futuretutor.ca/en/tutor/bookings";
    const content = await buildTutorBookingEmailContent(baseContext({ bookingUrl: url }));
    expect(content.html).toContain(`<a href="${url}"`);
  });

  it("escapes HTML-significant characters (defense in depth, even though inputs are server-resolved)", async () => {
    const content = await buildTutorBookingEmailContent(baseContext({ learnerFirstName: "<script>alert(1)</script>" }));
    expect(content.html).not.toContain("<script>alert(1)</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });
});

describe("buildPayerBookingEmailContent", () => {
  it("EN request produces the real EN subject/copy", async () => {
    const content = await buildPayerBookingEmailContent(baseContext());
    expect(content.subject).toBe(enMessages.payerBookingEmail.subject);
  });

  it("FR request produces the real FR subject/copy, not EN", async () => {
    const content = await buildPayerBookingEmailContent(baseContext({ locale: "fr" }));
    expect(content.subject).toBe(frMessages.payerBookingEmail.subject);
    expect(content.subject).not.toBe(enMessages.payerBookingEmail.subject);
  });

  it("includes the amount actually paid, formatted as currency", async () => {
    const content = await buildPayerBookingEmailContent(baseContext({ amountCents: 3200, currency: "CAD" }));
    expect(content.text).toMatch(/(CA\$|\$)\s*32\.00|32,00\s*\$/);
  });

  it("self-managed student (payer IS the learner): does not add a separate 'for {learner}' line", async () => {
    const content = await buildPayerBookingEmailContent(baseContext({ payerFirstName: "Hamed", learnerFirstName: "Hamed", payerIsLearner: true }));
    // The learnerLabel row ("For") must not appear when payer === learner.
    expect(content.text).not.toContain(`${enMessages.payerBookingEmail.learnerLabel}: Hamed`);
  });

  it("parent booking for a child: names the child separately from the payer greeting", async () => {
    const content = await buildPayerBookingEmailContent(
      baseContext({ payerFirstName: "Amina", learnerFirstName: "Yusuf", payerIsLearner: false })
    );
    expect(content.text).toContain("Amina"); // greeted by their own name
    expect(content.text).toContain(`${enMessages.payerBookingEmail.learnerLabel}: Yusuf`); // child named in the "For" row
  });

  it("formats the session time in the booking's own timezone, never UTC", async () => {
    const content = await buildPayerBookingEmailContent(baseContext());
    expect(content.text).toContain("6:00");
    expect(content.text).toContain("7:00");
    expect(content.text).toContain("America/Edmonton");
  });

  it("never includes card number or payment-instrument details", async () => {
    const content = await buildPayerBookingEmailContent(baseContext());
    const serialized = `${content.subject}\n${content.html}\n${content.text}`;
    expect(serialized.toLowerCase()).not.toContain("card number");
    expect(serialized.toLowerCase()).not.toMatch(/\b\d{12,19}\b/); // no raw card-like digit sequences
  });

  it("html includes a clickable link to the dashboard bookings CTA", async () => {
    const url = "https://futuretutor.ca/en/dashboard/bookings";
    const content = await buildPayerBookingEmailContent(baseContext({ bookingUrl: url }));
    expect(content.html).toContain(`<a href="${url}"`);
  });
});

describe("PROD-BOOKING-NOTIFICATIONS1-I18NFIX1 — request-independent translation", () => {
  // Items 1-4: these are proven by every test above already running with no
  // next/headers, no next-intl/server mock, and no Next.js request context
  // (vitest never provides one) — if the builders still depended on
  // getTranslations()'s request-bound config resolution, every test in this
  // file would already be throwing "Couldn't find next-intl config file."
  // This block adds the fallback/negative-space assertions that aren't
  // otherwise implied by the happy-path tests above.

  it("item 5 — no next-intl/server or next/headers import statement exists in the booking email content module or its translation helper (doc-comment mentions of the old dependency, explaining what was removed, are fine)", async () => {
    const fs = await import("node:fs/promises");
    const contentSource = await fs.readFile(new URL("./bookingConfirmationEmailContent.ts", import.meta.url), "utf-8");
    const translationSource = await fs.readFile(new URL("./emailTranslation.ts", import.meta.url), "utf-8");
    const importStatementPattern = /(?:from|require\()\s*["']next-intl\/server["']|(?:from|require\()\s*["']next\/headers["']/;
    expect(contentSource).not.toMatch(importStatementPattern);
    expect(translationSource).not.toMatch(importStatementPattern);
  });

  it("item 7 — a missing locale (empty string) falls back to the documented default (en), not an error", async () => {
    const content = await buildTutorBookingEmailContent(baseContext({ locale: "" }));
    expect(content.subject).toBe(enMessages.tutorBookingEmail.subject);
  });

  it("item 8 — an unsupported locale (e.g. 'de') falls back to the documented default (en), matching i18n/request.ts's own hasLocale-based policy", async () => {
    const content = await buildPayerBookingEmailContent(baseContext({ locale: "de" }));
    expect(content.subject).toBe(enMessages.payerBookingEmail.subject);
  });
});
