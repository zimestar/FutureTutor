import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveVerifiedTestDatabase } from "./testDatabaseSafety";

// Phase H.2 — permanent regression coverage for the fail-closed test
// database safety mechanism itself. This is a security-critical piece (it
// is the ONLY thing standing between a misconfigured/missing
// DATABASE_URL_TEST and an integration test accidentally mutating the
// normal development database), so it gets its own dedicated test suite,
// not just incidental coverage from the integration tests that use it.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_TEST;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveVerifiedTestDatabase — fail-closed cases", () => {
  it("throws when DATABASE_URL is not set", () => {
    process.env.DATABASE_URL_TEST = "postgresql://u:p@localhost:5433/futuretutor_test";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/DATABASE_URL is not set/);
  });

  it("throws when DATABASE_URL_TEST is not set", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/DATABASE_URL_TEST is not set/);
  });

  it("throws when DATABASE_URL_TEST's database name equals DATABASE_URL's", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://u:p@localhost:5433/futuretutor";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/identical to DATABASE_URL/);
  });

  it("throws when the test database name lacks the required safe naming convention", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://u:p@localhost:5433/futuretutor_scratch_db";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/safe naming convention/);
  });

  it("throws when the test database host is not an explicitly permitted local host", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://u:p@some-remote-host.example.com:5432/futuretutor_test";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/not an explicitly permitted local test host/);
  });

  it("throws when the test database host differs from the dev database host, even if both are technically local", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://u:p@127.0.0.1:5433/futuretutor_test";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/differs from DATABASE_URL's host/);
  });

  it("throws when DATABASE_URL_TEST cannot be parsed as a URL", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "not-a-valid-connection-string";
    expect(() => resolveVerifiedTestDatabase()).toThrow(/could not be parsed/);
  });

  it("never includes credentials in a thrown error message", () => {
    process.env.DATABASE_URL = "postgresql://secretuser:secretpass@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://secretuser:secretpass@localhost:5433/futuretutor";
    try {
      resolveVerifiedTestDatabase();
      throw new Error("expected resolveVerifiedTestDatabase to throw");
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain("secretuser");
      expect(message).not.toContain("secretpass");
    }
  });
});

describe("resolveVerifiedTestDatabase — accepted cases", () => {
  it("accepts a properly isolated, safely-named, localhost test database (exact name)", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://u:p@localhost:5433/futuretutor_test";
    const result = resolveVerifiedTestDatabase();
    expect(result.databaseName).toBe("futuretutor_test");
    expect(result.host).toBe("localhost");
  });

  it("accepts a test database name ending in _test (not just the exact convention name)", () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/futuretutor";
    process.env.DATABASE_URL_TEST = "postgresql://u:p@localhost:5433/futuretutor_migration_replay_test";
    const result = resolveVerifiedTestDatabase();
    expect(result.databaseName).toBe("futuretutor_migration_replay_test");
  });
});
