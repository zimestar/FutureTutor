import { describe, expect, it } from "vitest";
import { resolveRequestedTutoringMode } from "./tutoringModeResolution";

// PROD-DIRECT-BOOKING-MODEFIX1 — exhaustive coverage of the capability x
// requested-mode matrix. Mirrors the mission's own Part 2 spec table
// verbatim so the rule stays traceable back to its source of truth.

describe("resolveRequestedTutoringMode", () => {
  describe("tutor capability ONLINE", () => {
    it("requested ONLINE => ONLINE", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "ONLINE", requestedMode: "ONLINE" })).toBe("ONLINE");
    });
    it("requested IN_PERSON => reject", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "ONLINE", requestedMode: "IN_PERSON" })).toBeNull();
    });
    it("missing => deterministic ONLINE", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "ONLINE", requestedMode: undefined })).toBe("ONLINE");
      expect(resolveRequestedTutoringMode({ tutorCapability: "ONLINE", requestedMode: null })).toBe("ONLINE");
    });
    it("requested BOTH => reject", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "ONLINE", requestedMode: "BOTH" })).toBeNull();
    });
  });

  describe("tutor capability IN_PERSON", () => {
    it("requested IN_PERSON => IN_PERSON", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "IN_PERSON", requestedMode: "IN_PERSON" })).toBe(
        "IN_PERSON"
      );
    });
    it("requested ONLINE => reject", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "IN_PERSON", requestedMode: "ONLINE" })).toBeNull();
    });
    it("missing => deterministic IN_PERSON", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "IN_PERSON", requestedMode: undefined })).toBe(
        "IN_PERSON"
      );
    });
  });

  describe("tutor capability BOTH", () => {
    it("requested ONLINE => ONLINE", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "BOTH", requestedMode: "ONLINE" })).toBe("ONLINE");
    });
    it("requested IN_PERSON => IN_PERSON", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "BOTH", requestedMode: "IN_PERSON" })).toBe(
        "IN_PERSON"
      );
    });
    it("missing => reject (never silently inferred)", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "BOTH", requestedMode: undefined })).toBeNull();
      expect(resolveRequestedTutoringMode({ tutorCapability: "BOTH", requestedMode: null })).toBeNull();
    });
    it("requested BOTH => reject", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "BOTH", requestedMode: "BOTH" })).toBeNull();
    });
  });

  describe("malformed input", () => {
    it("an arbitrary string is rejected regardless of capability", () => {
      expect(resolveRequestedTutoringMode({ tutorCapability: "BOTH", requestedMode: "hybrid" })).toBeNull();
      expect(resolveRequestedTutoringMode({ tutorCapability: "ONLINE", requestedMode: "" })).toBeNull();
    });
  });
});
