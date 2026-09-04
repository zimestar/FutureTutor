import { describe, it, expect } from "vitest";
import { createEmailTranslator, resolveEmailLocale } from "./emailTranslation";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

// PROD-BOOKING-NOTIFICATIONS1-I18NFIX1 — this module is the sole
// request-independent translation mechanism for transactional emails. It
// must never import next-intl/server or next/headers (proven at the
// bookingConfirmationEmailContent.test.ts layer via a static source check),
// and must resolve real messages/en.json + messages/fr.json content with
// the same fallback policy as i18n/request.ts's own requestLocale
// resolution.

describe("resolveEmailLocale", () => {
  it("returns a supported locale unchanged", () => {
    expect(resolveEmailLocale("en")).toBe("en");
    expect(resolveEmailLocale("fr")).toBe("fr");
  });

  it("falls back to the routing default (en) for a missing/empty candidate", () => {
    expect(resolveEmailLocale(undefined)).toBe("en");
    expect(resolveEmailLocale(null)).toBe("en");
    expect(resolveEmailLocale("")).toBe("en");
  });

  it("falls back to the routing default (en) for an unsupported locale", () => {
    expect(resolveEmailLocale("de")).toBe("en");
    expect(resolveEmailLocale("es")).toBe("en");
  });
});

describe("createEmailTranslator", () => {
  it("resolves real EN keys from messages/en.json with no request context", () => {
    const t = createEmailTranslator("en", "tutorBookingEmail");
    expect(t("subject")).toBe(en.tutorBookingEmail.subject);
  });

  it("resolves real FR keys from messages/fr.json with no request context", () => {
    const t = createEmailTranslator("fr", "tutorBookingEmail");
    expect(t("subject")).toBe(fr.tutorBookingEmail.subject);
    expect(t("subject")).not.toBe(en.tutorBookingEmail.subject);
  });

  it("resolves a dotted namespace path", () => {
    const t = createEmailTranslator("en", "subjects.items");
    expect(t("math")).toBe(en.subjects.items.math);
  });

  it("interpolates values into a message", () => {
    const t = createEmailTranslator("en", "tutorBookingEmail");
    expect(t("greeting", { name: "Matthew" })).toBe(en.tutorBookingEmail.greeting.replace("{name}", "Matthew"));
  });

  it("falls back to EN messages for an unsupported locale, rather than throwing", () => {
    const t = createEmailTranslator("de", "tutorBookingEmail");
    expect(t("subject")).toBe(en.tutorBookingEmail.subject);
  });
});
