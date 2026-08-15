/**
 * Phase H.2 — fail-closed verification that a DB-mutating integration test
 * is genuinely targeting an isolated test database, never the normal local
 * development database. See the Phase H planning report's "Isolated Test
 * Database Architecture" section (hardened per the final review round:
 * parsed host/database-name comparison, not raw string inequality).
 *
 * This module has no `server-only` guard and no dependency on `@/lib/db` —
 * it must be safely importable from a plain Vitest test file without
 * pulling in the app's server-only module graph.
 */

export interface VerifiedTestDatabaseTarget {
  connectionString: string;
  host: string;
  port: string;
  databaseName: string;
}

/**
 * Parses DATABASE_URL and DATABASE_URL_TEST and positively verifies every
 * safety condition before returning a usable connection target. Throws
 * (never returns a value) if any condition fails — this is the actual
 * mechanism that makes "a typo can never cause a test to mutate the normal
 * dev DB" true, not just documented intent.
 */
export function resolveVerifiedTestDatabase(): VerifiedTestDatabaseTarget {
  const devUrlRaw = process.env.DATABASE_URL;
  const testUrlRaw = process.env.DATABASE_URL_TEST;

  if (!devUrlRaw) {
    throw new Error(
      "FAIL CLOSED: DATABASE_URL is not set — cannot verify the test database is distinct from the normal development database. Refusing to run any DB-mutating test."
    );
  }
  if (!testUrlRaw) {
    throw new Error(
      "FAIL CLOSED: DATABASE_URL_TEST is not set. Permanent DB-integration tests require a dedicated, isolated test database " +
        "(see the Phase H planning report's 'Isolated Test Database Architecture' section). " +
        "Configure DATABASE_URL_TEST in your local .env (never committed) pointing at a database distinct from DATABASE_URL, " +
        'named exactly "futuretutor_test" or ending in "_test", on the same local host as DATABASE_URL. Refusing to run any DB-mutating test.'
    );
  }

  let devUrl: URL;
  let testUrl: URL;
  try {
    devUrl = new URL(devUrlRaw);
  } catch {
    throw new Error("FAIL CLOSED: DATABASE_URL could not be parsed as a valid connection string.");
  }
  try {
    testUrl = new URL(testUrlRaw);
  } catch {
    throw new Error("FAIL CLOSED: DATABASE_URL_TEST could not be parsed as a valid connection string.");
  }

  const devDbName = devUrl.pathname.replace(/^\//, "");
  const testDbName = testUrl.pathname.replace(/^\//, "");

  // 1. Positively confirm the database NAMES differ (not raw string
  // inequality of the whole connection string — two syntactically
  // different URLs could otherwise resolve to the same physical database).
  if (testDbName === devDbName) {
    throw new Error(
      `FAIL CLOSED: DATABASE_URL_TEST's database name ("${testDbName}") is identical to DATABASE_URL's. Refusing to run any DB-mutating test.`
    );
  }

  // 2. Positively confirm the test database name matches an explicit safe
  // naming convention — not merely "any different name."
  const hasSafeNamingConvention = testDbName === "futuretutor_test" || testDbName.endsWith("_test");
  if (!hasSafeNamingConvention) {
    throw new Error(
      `FAIL CLOSED: DATABASE_URL_TEST's database name ("${testDbName}") does not match the required safe naming convention ` +
        '(must be exactly "futuretutor_test" or end with "_test"). Refusing to run any DB-mutating test.'
    );
  }

  // 3. Positively confirm the host is an explicitly permitted local test
  // host — no production/staging/remote host is ever accepted here.
  const permittedTestHosts = new Set(["localhost", "127.0.0.1"]);
  if (!permittedTestHosts.has(testUrl.hostname)) {
    throw new Error(
      `FAIL CLOSED: DATABASE_URL_TEST's host ("${testUrl.hostname}") is not an explicitly permitted local test host ` +
        "(only localhost/127.0.0.1 are accepted). No production or staging host is ever accepted by this harness. Refusing to run any DB-mutating test."
    );
  }

  // 4. The test target must be on the same local development host as
  // DATABASE_URL itself — guards against a DATABASE_URL_TEST that's
  // technically "localhost" but was copy-pasted from an unrelated project.
  if (testUrl.hostname !== devUrl.hostname) {
    throw new Error(
      `FAIL CLOSED: DATABASE_URL_TEST's host ("${testUrl.hostname}") differs from DATABASE_URL's host ("${devUrl.hostname}") — ` +
        "expected both to point at the same local development Postgres instance. Refusing to run any DB-mutating test."
    );
  }

  return {
    connectionString: testUrlRaw,
    host: testUrl.hostname,
    port: testUrl.port,
    databaseName: testDbName,
  };
}
