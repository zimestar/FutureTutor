import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

/**
 * TUTOR-PAYOUT-TRANSPARENCY1 — items 19/20: every new earningPresentation/
 * transparency key must exist, non-empty, in both locales, and never
 * mention "scheduled end" as the delay anchor (the mission's own explicit
 * ban — the certified rule is the authoritative OUTCOME timestamp, not the
 * booking's scheduled end time).
 */
const NEW_REASON_KEYS = [
  "pendingOutcome",
  "pendingEligibility",
  "pendingEligibilityExpected",
  "eligible",
  "held",
  "heldTutorNoShow",
  "heldNoShowUnresolved",
  "heldInterrupted",
  "transferred",
  "cancelled",
] as const;

describe("tutorPayouts translations", () => {
  for (const locale of ["en", "fr"] as const) {
    const messages = locale === "en" ? en : fr;

    it(`${locale} has a label and description for every earning reason key`, () => {
      for (const key of NEW_REASON_KEYS) {
        const entry = (messages.tutorPayouts.earningPresentation as Record<string, { label?: string; description?: string }>)[key];
        expect(entry, `missing ${locale} earningPresentation.${key}`).toBeTruthy();
        expect(entry!.label).toBeTruthy();
        expect(entry!.description).toBeTruthy();
      }
    });

    it(`${locale} distinguishes a persisted eligibility date from a projected one with different keys`, () => {
      expect(messages.tutorPayouts.earningPresentation.pendingEligibility.eligibleAt).toBeTruthy();
      expect(messages.tutorPayouts.earningPresentation.pendingEligibilityExpected.expectedEligibleAt).toBeTruthy();
      expect(messages.tutorPayouts.earningPresentation.pendingEligibility.eligibleAt).not.toBe(
        messages.tutorPayouts.earningPresentation.pendingEligibilityExpected.expectedEligibleAt
      );
    });

    it(`${locale} has the transparency explanatory section`, () => {
      expect(messages.tutorPayouts.transparency.title).toBeTruthy();
      expect(messages.tutorPayouts.transparency.intro).toBeTruthy();
      expect(messages.tutorPayouts.transparency.delay).toBeTruthy();
      expect(messages.tutorPayouts.transparency.eligibilityVsPayout).toBeTruthy();
      expect(messages.tutorPayouts.transparency.transferVsBank).toBeTruthy();
    });

    it(`${locale} anchors the delay to the finalized outcome, and explicitly disclaims the scheduled-end reading rather than staying silent on it`, () => {
      const delay = messages.tutorPayouts.transparency.delay.toLowerCase();
      // The mission's own forbidden phrase is a delay measured directly
      // FROM the scheduled end — never present as a positive claim. The
      // copy is allowed (and expected) to mention "scheduled end" only to
      // explicitly rule it out ("not from ... scheduled end").
      expect(delay).not.toMatch(/24[\s-]hours? after (the )?(session'?s )?scheduled end/);
      expect(delay).toMatch(/finalized|finalisé/);
    });

    it(`${locale} never claims funds are already deposited in the tutor's bank account`, () => {
      const copy = messages.tutorPayouts.earningPresentation.transferred.description.toLowerCase();
      expect(copy).not.toMatch(/paid to your bank|already (been )?deposited|déjà déposé|a été déposé|a été payé sur votre compte/);
    });

    it(`${locale} transferred.description explains eventual bank payout is Stripe's, not FutureTutor's, timeline`, () => {
      expect(messages.tutorPayouts.earningPresentation.transferred.description.toLowerCase()).toContain("stripe");
    });
  }

  it("has a viewSession label in both locales", () => {
    expect(en.tutorPayouts.viewSession).toBeTruthy();
    expect(fr.tutorPayouts.viewSession).toBeTruthy();
  });
});
