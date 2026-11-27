import { resolveVerifiedTestDatabase } from "./testDatabaseSafety";

/**
 * RW-10 — side-effect import, placed BEFORE "@/lib/db" in an integration test
 * that uses the ambient client: points it at the verified test database, and
 * fails closed if that client was already created against another one.
 */
if ((globalThis as { prisma?: unknown }).prisma) {
  throw new Error("FAIL CLOSED: @/lib/db was loaded before useVerifiedTestDatabase. Refusing to run any DB-mutating test.");
}
process.env.DATABASE_URL = resolveVerifiedTestDatabase().connectionString;
