import { describe, expect, it } from "vitest";
import { buildAdminAlertEmailContent, type AdminAlertEmailContext } from "./adminAlertEmailContent";
import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";

// TUTOR-PIPELINE1 — admin alert email copy. No mocks: proves the builder
// works outside any Next.js request, like the candidate email builders.

const BASE_URL = "https://futuretutor.ca";

function context(overrides: Partial<AdminAlertEmailContext> = {}): AdminAlertEmailContext {
  return {
    locale: "en",
    event: "TUTOR_APPLICATION_SUBMITTED",
    detail: { tutorName: "Ada Tutor", applicationStatus: "UNDER_REVIEW" },
    baseUrl: BASE_URL,
    tutorProfileId: "tutor-1",
    ...overrides,
  };
}

const EVENTS = Object.keys(enMessages.adminAlertEmail.events) as Array<keyof typeof enMessages.adminAlertEmail.events>;

describe("buildAdminAlertEmailContent", () => {
  it("names the candidate and links to their application", () => {
    const content = buildAdminAlertEmailContent(context());
    expect(content.subject).toBe("New tutor application: Ada Tutor");
    expect(content.html).toContain(`${BASE_URL}/en/admin/tutors/tutor-1`);
    expect(content.text).toContain("Ada Tutor");
    expect(content.text).toContain(enMessages.dashboard.tutor.applicationStatus.UNDER_REVIEW);
  });

  it("uses French copy and French URLs for a French recipient", () => {
    const content = buildAdminAlertEmailContent(context({ locale: "fr" }));
    expect(content.subject).toBe("Nouvelle candidature de tuteur : Ada Tutor");
    expect(content.html).toContain(`${BASE_URL}/fr/admin/tutors/tutor-1`);
    expect(content.html).toContain(frMessages.adminAlertEmail.footer);
  });

  it("translates the document type", () => {
    const content = buildAdminAlertEmailContent(
      context({ event: "TUTOR_DOCUMENT_UPLOADED", detail: { tutorName: "Ada Tutor", documentType: "DIPLOMA" } })
    );
    expect(content.text).toContain(`(${enMessages.tutorDocuments.types.DIPLOMA})`);
  });

  it("escapes candidate-controlled text in the HTML", () => {
    const content = buildAdminAlertEmailContent(context({ detail: { tutorName: "<script>x</script>" } }));
    expect(content.html).not.toContain("<script>x</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("lists digest items with their stage, wait and next action, and links to the board", () => {
    const content = buildAdminAlertEmailContent(
      context({
        event: "TUTOR_PIPELINE_DIGEST",
        tutorProfileId: null,
        detail: {
          items: [
            { tutorName: "Ada Tutor", status: "UNDER_REVIEW", waitingDays: 6, nextAction: "reviewDocuments" },
            { tutorName: "Ben Tutor", status: "INTERVIEW_REQUIRED", waitingDays: 1, nextAction: "scheduleInterview" },
          ],
        },
      })
    );
    expect(content.text).toContain("2 applications have been waiting");
    expect(content.text).toContain(`Ada Tutor: ${enMessages.dashboard.tutor.applicationStatus.UNDER_REVIEW} · waiting 6 days · Review the documents`);
    expect(content.text).toContain("waiting 1 day · Schedule the interview");
    expect(content.html).toContain(`${BASE_URL}/en/admin/tutors/pipeline`);
  });

  it("SAFETY-REPORTS1 — a safety alert shows category and urgency, links to the report, never the description", () => {
    const urgent = buildAdminAlertEmailContent(
      context({
        locale: "fr",
        event: "SAFETY_CONCERN_REPORTED",
        tutorProfileId: null,
        detail: { category: "CHILD_SAFETY", immediateDanger: true, adminPath: "/admin/safety-reports/rep-1", description: "SECRET TEXT" },
      })
    );
    expect(urgent.subject).toBe("URGENT — danger immédiat signalé");
    expect(urgent.text).toContain(frMessages.safetyReport.categories.CHILD_SAFETY);
    expect(urgent.html).toContain(`${BASE_URL}/fr/admin/safety-reports/rep-1`);
    expect(urgent.html).toContain(frMessages.adminAlertEmail.footerSafety);
    expect(urgent.text).not.toContain("SECRET TEXT");

    const normal = buildAdminAlertEmailContent(
      context({ event: "SAFETY_CONCERN_REPORTED", tutorProfileId: null, detail: { category: "OTHER", immediateDanger: false, adminPath: "https://evil.test/x" } })
    );
    expect(normal.subject).toBe("Safety concern reported");
    expect(normal.html).not.toContain("evil.test");
  });

  it("ignores a malformed digest snapshot instead of failing", () => {
    const content = buildAdminAlertEmailContent(context({ event: "TUTOR_PIPELINE_DIGEST", tutorProfileId: null, detail: { items: "bad" } }));
    expect(content.text).toContain("0 applications have been waiting");
  });

  it.each(["en", "fr"] as const)("every event renders fully resolved %s copy", (locale) => {
    for (const event of EVENTS) {
      const content = buildAdminAlertEmailContent(context({ locale, event, detail: { tutorName: "Ada Tutor", documentType: "DIPLOMA", items: [] } }));
      expect(content.subject.length).toBeGreaterThan(0);
      expect(content.text).not.toMatch(/adminAlertEmail\./);
      expect(content.text).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it("has the same events and next actions in both languages", () => {
    expect(Object.keys(frMessages.adminAlertEmail.events).sort()).toEqual([...EVENTS].sort());
    expect(Object.keys(frMessages.adminAlertEmail.nextActions).sort()).toEqual(Object.keys(enMessages.adminAlertEmail.nextActions).sort());
  });
});
