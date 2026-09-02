import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// BETA-LAUNCHFIX1 — proves the tutor-facing "Connect unavailable" copy
// exists, is present in both locales, and never leaks internal terminology
// (Stripe, Connect, CLOSED_BETA_MODE, PAYMENT_MODE, "frozen", "specialist")
// to a normal tutor — mirroring provinceMessages.test.ts's established
// pattern for testing translation content directly.

// Note: "configuration" is deliberately excluded — the approved French copy
// uses it as ordinary vocabulary ("la configuration des versements" =
// "payout setup"), not as a leak of the English technical term.
const FORBIDDEN_TERMS = [
  "Stripe",
  "Connect",
  "CLOSED_BETA_MODE",
  "PAYMENT_MODE",
  "frozen",
  "specialist",
  "activation_required",
];

describe("BETA-LAUNCHFIX1 — tutorPayouts.connectUnavailableNotice", () => {
  it("EN: matches the approved beta-safe copy", () => {
    expect(en.tutorPayouts.connectUnavailableNotice).toBe(
      "Payout setup is not yet available during the closed beta. We'll let you know when it becomes available."
    );
  });

  it("FR: matches the approved beta-safe copy", () => {
    expect(fr.tutorPayouts.connectUnavailableNotice).toBe(
      "La configuration des versements n'est pas encore disponible pendant la bêta fermée. Nous vous informerons lorsqu'elle sera disponible."
    );
  });

  for (const [locale, messages] of [
    ["en", en],
    ["fr", fr],
  ] as const) {
    it(`${locale}: does not mention any internal/technical term`, () => {
      const copy = messages.tutorPayouts.connectUnavailableNotice;
      for (const term of FORBIDDEN_TERMS) {
        expect(copy.toLowerCase(), `should not contain "${term}"`).not.toContain(term.toLowerCase());
      }
    });

    it(`${locale}: does not promise a specific date`, () => {
      const copy = messages.tutorPayouts.connectUnavailableNotice as string;
      // No digit sequences (dates, ETAs) anywhere in the message.
      expect(copy).not.toMatch(/\d/);
    });
  }
});
