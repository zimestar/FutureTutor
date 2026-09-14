import { describe, expect, it } from "vitest";
import { isDeniedPropertyKey, findDeniedProperties } from "./piiDenylist";

// DATA-1 — the runtime PII denylist. Defense-in-depth behind the primary
// control (AnalyticsEventPropertiesMap's compile-time allowlist,
// types.test.ts) for anything that reaches trackEvent via an `as any`
// cast or a future refactor.

describe("isDeniedPropertyKey", () => {
  it.each(["email", "name", "firstName", "lastName", "phone", "address", "message", "notes", "password", "authToken", "sessionToken", "userId", "bookingId", "id"])(
    "denies %s",
    (key) => {
      expect(isDeniedPropertyKey(key)).toBe(true);
    },
  );

  it("is case-insensitive", () => {
    expect(isDeniedPropertyKey("EMAIL")).toBe(true);
    expect(isDeniedPropertyKey("Email")).toBe(true);
  });

  it("normalizes snake_case and kebab-case to the same denylist entries", () => {
    expect(isDeniedPropertyKey("first_name")).toBe(true);
    expect(isDeniedPropertyKey("first-name")).toBe(true);
  });

  it.each(["locale", "page_type", "cta_location", "subject_slug", "resource_slug", "city_slug", "user_intent", "level", "mode"])(
    "allows the real, safe analytics properties: %s",
    (key) => {
      expect(isDeniedPropertyKey(key)).toBe(false);
    },
  );
});

describe("findDeniedProperties", () => {
  it("returns an empty array for a safe properties object", () => {
    expect(findDeniedProperties({ locale: "en", page_type: "homepage" })).toEqual([]);
  });

  it("returns an empty array for undefined properties", () => {
    expect(findDeniedProperties(undefined)).toEqual([]);
  });

  it("flags every denylisted key present, not just the first", () => {
    const denied = findDeniedProperties({ locale: "en", email: "a@b.com", name: "Jane" });
    expect(denied.sort()).toEqual(["email", "name"]);
  });
});
