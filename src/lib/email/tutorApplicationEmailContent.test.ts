import { describe, it, expect } from "vitest";
import { buildTutorApplicationEmailContent, type TutorApplicationEmailContext } from "./tutorApplicationEmailContent";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// PROD-TUTOR-APPLICATION-NOTIFICATIONS1 — permanent unit tests for the
// tutor-application-lifecycle email content builder. Runs with no mocking
// at all (no next-intl/server, no next/headers anywhere in the call
// chain) — proves request-independence the same way
// bookingConfirmationEmailContent.test.ts does (item 22).

function baseContext(overrides: Partial<TutorApplicationEmailContext> = {}): TutorApplicationEmailContext {
  return {
    locale: "en",
    tutorFirstName: "Matthew",
    event: "APPLICATION_SUBMITTED",
    applicationStatus: "SUBMITTED",
    detail: {},
    dashboardUrl: "https://www.futuretutor.ca/en/tutor/dashboard",
    ...overrides,
  };
}

describe("buildTutorApplicationEmailContent", () => {
  it("item 20 — EN request produces the real EN subject/heading/intro from messages/en.json", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext());
    expect(content.subject).toBe(enMessages.tutorApplicationEmail.events.APPLICATION_SUBMITTED.subject);
    expect(content.html).toContain(enMessages.tutorApplicationEmail.events.APPLICATION_SUBMITTED.heading);
  });

  it("item 21 — FR request produces the real FR copy, not EN", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ locale: "fr" }));
    expect(content.subject).toBe(frMessages.tutorApplicationEmail.events.APPLICATION_SUBMITTED.subject);
    expect(content.subject).not.toBe(enMessages.tutorApplicationEmail.events.APPLICATION_SUBMITTED.subject);
  });

  it("every one of the 18 events produces distinct, real EN copy with no unresolved key in the output", async () => {
    const events = Object.keys(enMessages.tutorApplicationEmail.events) as Array<
      keyof typeof enMessages.tutorApplicationEmail.events
    >;
    expect(events).toHaveLength(18);
    for (const event of events) {
      const content = await buildTutorApplicationEmailContent(
        baseContext({
          event: event as TutorApplicationEmailContext["event"],
          detail: { documentType: "TRANSCRIPT", reason: "Sample reason", score: 42, scheduledAtIso: "2026-09-20T14:00:00.000Z" },
        })
      );
      expect(content.subject).toBe(enMessages.tutorApplicationEmail.events[event].subject);
      expect(content.html).not.toContain("tutorApplicationEmail.");
      expect(content.text).not.toContain("tutorApplicationEmail.");
    }
  });

  it("item 23 — CTA uses the passed-in dashboardUrl (https://www.futuretutor.ca in the controlled production case)", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ dashboardUrl: "https://www.futuretutor.ca/en/tutor/dashboard" }));
    expect(content.html).toContain(`<a href="https://www.futuretutor.ca/en/tutor/dashboard"`);
  });

  it("no localhost URL ever appears in the rendered output", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext());
    expect(content.html).not.toContain("localhost");
    expect(content.text).not.toContain("localhost");
  });

  it("shows the current stage label, translated via the same namespace the tutor dashboard uses", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ applicationStatus: "TRAINING_REQUIRED", event: "TRAINING_UNLOCKED" }));
    expect(content.text).toContain(enMessages.dashboard.tutor.applicationStatus.TRAINING_REQUIRED);
  });

  it("shows the action-required indicator when the tutor is the responsible party (e.g. TRAINING_REQUIRED)", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ applicationStatus: "TRAINING_REQUIRED", event: "TRAINING_UNLOCKED" }));
    expect(content.text).toContain(enMessages.tutorApplicationEmail.actionRequiredLabel);
  });

  it("shows the no-action indicator when FutureTutor is the responsible party (e.g. UNDER_REVIEW)", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ applicationStatus: "UNDER_REVIEW", event: "APPLICATION_UNDER_REVIEW" }));
    expect(content.text).toContain(enMessages.tutorApplicationEmail.noActionLabel);
  });

  it("APPLICATION_APPROVED never claims bookings are receivable if a further gate applies — uses the dedicated approvedNextStep copy", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ applicationStatus: "APPROVED", event: "APPLICATION_APPROVED" }));
    expect(content.text).toContain(enMessages.tutorApplicationEmail.approvedNextStep);
    expect(content.text.toLowerCase()).not.toContain("start receiving bookings");
  });

  it("includes a document-rejection reason and the translated document type, never a raw enum value", async () => {
    const content = await buildTutorApplicationEmailContent(
      baseContext({ event: "DOCUMENT_REJECTED", applicationStatus: "UNDER_REVIEW", detail: { documentType: "TRANSCRIPT", reason: "Illegible scan" } })
    );
    expect(content.text).toContain("Illegible scan");
    expect(content.text).toContain(enMessages.tutorDocuments.types.TRANSCRIPT);
    expect(content.text).not.toContain("TRANSCRIPT");
  });

  it("item 28 — never includes internal-only fields (adminNotes is not part of the TutorApplicationEmailContext type at all)", async () => {
    const content = await buildTutorApplicationEmailContent(
      baseContext({ event: "DOCUMENT_REJECTED", applicationStatus: "UNDER_REVIEW", detail: { documentType: "TRANSCRIPT", reason: "Illegible scan" } })
    );
    const serialized = `${content.subject}\n${content.html}\n${content.text}`;
    expect(serialized.toLowerCase()).not.toContain("admin note");
    expect(serialized.toLowerCase()).not.toContain("internal");
  });

  it("interview scheduling renders the date/time explicitly in UTC (no stored tutor/interview timezone exists)", async () => {
    const content = await buildTutorApplicationEmailContent(
      baseContext({ event: "INTERVIEW_SCHEDULED", applicationStatus: "INTERVIEW_REQUIRED", detail: { scheduledAtIso: "2026-09-20T14:00:00.000Z" } })
    );
    expect(content.text).toContain("(UTC)");
  });

  it("admin attribution: always says the FutureTutor team, never an admin's own name/email", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext());
    expect(content.text).toContain(enMessages.tutorApplicationEmail.updatedByTeam);
  });

  it("escapes HTML-significant characters in interpolated content", async () => {
    const content = await buildTutorApplicationEmailContent(
      baseContext({ event: "DOCUMENT_REJECTED", applicationStatus: "UNDER_REVIEW", detail: { documentType: "TRANSCRIPT", reason: "<script>alert(1)</script>" } })
    );
    expect(content.html).not.toContain("<script>alert(1)</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("item 7 — missing locale falls back to the documented default (en)", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ locale: "" }));
    expect(content.subject).toBe(enMessages.tutorApplicationEmail.events.APPLICATION_SUBMITTED.subject);
  });

  it("item 8 — unsupported locale falls back to the documented default (en)", async () => {
    const content = await buildTutorApplicationEmailContent(baseContext({ locale: "de" }));
    expect(content.subject).toBe(enMessages.tutorApplicationEmail.events.APPLICATION_SUBMITTED.subject);
  });
});
