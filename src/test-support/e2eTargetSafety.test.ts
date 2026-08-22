import { afterEach, describe, expect, it } from "vitest";
import { assertExternalSuitesDisabled, resolveSafeE2ETarget } from "../../e2e/helpers/target";

afterEach(() => {
  delete process.env.E2E_EXTERNAL_EMAIL;
  delete process.env.E2E_FINANCIAL;
});

describe("E2E target guard", () => {
  it.each([
    ["http://localhost:3000", "local"],
    ["http://127.0.0.1:3000", "local"],
    ["https://futuretutor-web-production.up.railway.app", "staging"],
    ["https://staging.futuretutor.ca", "staging"],
  ])("allows %s as %s", (url, kind) => {
    expect(resolveSafeE2ETarget(url).kind).toBe(kind);
  });

  it.each([
    "https://futuretutor.ca",
    "https://www.futuretutor.ca",
    "https://example.com",
    "https://staging.futuretutor.ca.evil.example",
    "http://futuretutor-web-production.up.railway.app",
    "https://futuretutor-web-production.up.railway.app/path",
    "not-a-url",
  ])("blocks unsafe target %s", (url) => {
    expect(() => resolveSafeE2ETarget(url)).toThrow();
  });

  it("fails closed when external email or financial execution is requested", () => {
    process.env.E2E_EXTERNAL_EMAIL = "true";
    expect(() => assertExternalSuitesDisabled()).toThrow(/External email/);
    delete process.env.E2E_EXTERNAL_EMAIL;
    process.env.E2E_FINANCIAL = "true";
    expect(() => assertExternalSuitesDisabled()).toThrow(/Financial/);
  });
});
